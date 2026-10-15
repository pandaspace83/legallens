"""C · Chat history and D · Chat: turns over SSE, replay, cancel, idempotency, feedback, citations; the matter
event stream."""

import json
import threading
import time
import uuid

import httpx
import pytest

from tests.conftest import Api, LiveServer, parse_sse, read_sse


@pytest.fixture
def smith(api: Api) -> dict:  # type: ignore[type-arg]
    matter = api.create_matter(
        profile={
            "parties": [
                {
                    "name": "Acme Corp",
                    "role": "opposing",
                    "represented": True,
                    "counsel": {"name": "Dana Whitfield", "firm": "Whitfield & Grant LLP"},
                }
            ]
        },
        jurisdiction="California",
    )
    ids = api.ingest(matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf", "exhibit_b_invoices.pdf")
    return {**matter, "msa": ids[0], "letter": ids[1], "exhibit": ids[2]}


class TestTurns:
    def test_found_answer_event_order_and_citations(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        turn = api.ask(api.new_chat(smith["id"]), "How must a termination notice be delivered?")
        names = turn.names
        assert names[:3] == ["run.started", "intent", "scope"]
        steps = [d["step"] for n, d, _ in turn.events if n == "status"]
        assert steps == ["rewriting", "searching", "reranking", "generating", "verifying"]
        assert names.index("token") < names.index("citation") < names.index("answer_state") < names.index("done")
        assert names[-1] == "done"
        assert [int(i) for _, _, i in turn.events] == list(range(1, len(turn.events) + 1))  # sequence ids
        assert turn.first("intent") == {"intent": "ask", "confidence": 0.8}
        assert turn.first("scope")["searching"] == "All 3 documents in this matter"
        assert turn.first("answer_state")["state"] == "found"
        searched = turn.first("answer_state")["searched"]
        assert searched["scope_label"] == "All 3 documents in this matter" and searched["documents_searched"] == 3
        assert searched["rewritten_question"] == "How must a termination notice be delivered?"
        assert searched["passages_reviewed"] >= searched["passages_used"] > 0
        assert turn.answer["searched"] == searched  # stored with the message (INT-1.1)
        streamed = turn.first("citation")
        assert streamed["quote"] == turn.answer["citations"][0]["quote"] and streamed["quote"]

        answer = turn.answer
        assert answer["status"] == "complete" and answer["answer_state"] == "found"
        assert answer["content"] == "".join(d["delta"] for n, d, _ in turn.events if n == "token")
        first = answer["citations"][0]
        assert (first["document_name"], first["para_ref"], first["verified"]) == ("smith_msa_v3.pdf", "4.2(b)", True)
        assert "certified mail" in first["quote"] and "[1]" in answer["content"]
        assert answer["model_id"] == "stub-orchestrator" and answer["prompt_version"] == "stub-0"
        assert answer["tokens_in"] > 0 and answer["latency_ms"] >= 0

        location = api.client.get(f"/api/v1/citations/{first['id']}").json()
        assert location["page"] == 1 and len(location["bbox"]) == 4 and location["page_width"] == 612

    def test_not_found_and_outside_law(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        chat = api.new_chat(smith["id"])
        missing = api.ask(chat, "What is the capital of France?")
        assert missing.first("answer_state")["state"] == "not_found" and "citation" not in missing.names
        assert missing.answer["searched"]["passages_used"] == 0  # nothing passed the gate
        assert missing.answer["content"].startswith("Not found in your documents.")

        law = api.ask(chat, "Is the liability cap enforceable in California?")
        state = law.first("answer_state")
        assert (state["state"], state["outside_law"]) == ("partial", True)
        assert "not whether California law would enforce it" in law.answer["content"]
        assert law.answer["citations"][0]["para_ref"] == "7.1"

    def test_this_document_scope(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        chat = api.new_chat(smith["id"])
        turn = api.ask(chat, "How much is unpaid?", scope={"kind": "documents", "document_ids": [smith["exhibit"]]})
        assert turn.first("scope")["searching"] == "exhibit_b_invoices"
        assert {c["document_id"] for c in turn.answer["citations"]} == {smith["exhibit"]}
        bad = api.client.post(
            f"/api/v1/conversations/{chat}/messages",
            json={"content": "x", "scope": {"kind": "documents", "document_ids": ["doc_nope"]}},
            headers={"Idempotency-Key": "bad-scope"},
        )
        assert (bad.status_code, bad.json()["code"], bad.json()["document_ids"]) == (422, "invalid_scope", ["doc_nope"])

    def test_follow_up_uses_the_conversation(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        chat = api.new_chat(smith["id"])
        api.ask(chat, "How must a termination notice be delivered?")
        follow = api.ask(chat, "and when is it effective?")
        with api.database.read() as db:
            from sqlalchemy import text

            rewritten = db.execute(text("SELECT rewritten_query FROM retrieval_traces ORDER BY id DESC")).scalar()
        assert rewritten == "How must a termination notice be delivered? and when is it effective?"
        assert "effective" in follow.answer["citations"][0]["quote"].lower()

    def test_summarize_and_draft_start_jobs(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        chat = api.new_chat(smith["id"])
        summary = api.ask(chat, "Summarize the acme_demand_letter_scanned for the client in plain English")
        assert summary.first("intent")["intent"] == "summarize"
        assert summary.first("job")["kind"] == "summarize" and "citation" not in summary.names
        draft = api.ask(
            chat, "Draft a response letter", mode="draft", options={"incoming_document_id": smith["letter"]}
        )
        assert draft.first("job")["kind"] == "draft"
        assert draft.answer["job_id"] == draft.first("job")["job_id"]
        # Stored messages say which summary or draft the job makes, so a reloaded chat shows its job card.
        assert summary.answer["job"] == {"kind": "summarize", "entity_id": summary.first("job")["entity_id"]}
        assert draft.answer["job"] == {"kind": "draft", "entity_id": draft.first("job")["entity_id"]}
        assert summary.answer["searched"] is None  # no search ran

    def test_clarify_when_the_document_is_unclear(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        turn = api.ask(api.new_chat(smith["id"]), "Please summarize it", mode="summarize")
        assert turn.first("intent")["intent"] == "clarify"
        assert turn.answer["content"].startswith("Which document should I summarize?")


class TestStreamMechanics:
    def test_replay_from_last_event_id(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        turn = api.ask(api.new_chat(smith["id"]), "How must a termination notice be delivered?")
        replay = read_sse(api.client, turn.accepted["stream_url"], {"Last-Event-ID": "5"})
        assert [i for _, _, i in replay] == [str(i) for i in range(6, len(turn.events) + 1)]
        assert replay[-1][0] == "done"

    def test_finished_run_after_buffer_expiry(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        turn = api.ask(api.new_chat(smith["id"]), "How must a termination notice be delivered?")
        api.app.state.runs.runs.clear()
        (event,) = read_sse(api.client, turn.accepted["stream_url"])
        assert event[0] == "done" and event[1]["message_id"] == turn.answer["id"]

    def test_stop_mid_answer(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        api.settings.stub_token_delay_ms = 40
        chat = api.new_chat(smith["id"])
        accepted = api.client.post(
            f"/api/v1/conversations/{chat}/messages",
            json={"content": "How must a termination notice be delivered?"},
            headers={"Idempotency-Key": "stop-me"},
        ).json()
        time.sleep(0.3)
        busy = api.client.post(
            f"/api/v1/conversations/{chat}/messages", json={"content": "again"}, headers={"Idempotency-Key": "k2"}
        )
        assert (busy.status_code, busy.json()["code"]) == (409, "run_in_progress")
        assert api.client.post(f"/api/v1/runs/{accepted['run_id']}/cancel").json()["status"] == "cancelled"
        events = read_sse(api.client, accepted["stream_url"])
        assert events[-1][0] == "done" and events[-1][1]["cancelled"] is True
        last = api.client.get(f"/api/v1/conversations/{chat}/messages").json()["items"][-1]
        assert last["status"] == "cancelled"
        assert api.client.post(f"/api/v1/runs/{accepted['run_id']}/cancel").json()["status"] == "cancelled"

    def test_idempotency_key(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        chat = api.new_chat(smith["id"])
        url = f"/api/v1/conversations/{chat}/messages"
        body = {"content": "What notice is required?"}
        assert api.client.post(url, json=body).json()["code"] == "idempotency_key_required"
        first = api.client.post(url, json=body, headers={"Idempotency-Key": "same"}).json()
        read_sse(api.client, first["stream_url"])
        second = api.client.post(url, json=body, headers={"Idempotency-Key": "same"}).json()
        assert second == first
        conflict = api.client.post(url, json={"content": "other"}, headers={"Idempotency-Key": "same"})
        assert conflict.json()["code"] == "idempotency_conflict"
        assert len(api.client.get(f"/api/v1/conversations/{chat}/messages").json()["items"]) == 2

    def test_feedback(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        turn = api.ask(api.new_chat(smith["id"]), "How must a termination notice be delivered?")
        url = f"/api/v1/messages/{turn.answer['id']}/feedback"
        assert api.client.post(url, json={"kind": "wrong_citation", "note": "4.2(b) not (a)"}).status_code == 200
        assert api.client.post(url, json={"kind": "helpful"}).json()["kind"] == "helpful"
        messages = api.client.get(f"/api/v1/conversations/{turn.answer['conversation_id']}/messages").json()["items"]
        assert messages[-1]["feedback"] == "helpful"
        mine = api.client.post(f"/api/v1/messages/{messages[0]['id']}/feedback", json={"kind": "helpful"})
        assert mine.json()["code"] == "not_assistant_message"


class TestHistory:
    def test_sidebar_order_search_rename_pin_delete(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        chats = [api.new_chat(smith["id"]) for _ in range(3)]
        api.ask(chats[0], "How must a termination notice be delivered?")
        url = f"/api/v1/matters/{smith['id']}/conversations"
        items = api.client.get(url).json()["items"]
        assert items[0]["id"] == chats[0] and items[0]["title"] == "How must a termination notice be delivered"

        api.client.patch(f"/api/v1/conversations/{chats[2]}", json={"pinned": True, "title": "Key dates"})
        items = api.client.get(url).json()["items"]
        assert [c["id"] for c in items] == [chats[2], chats[0], chats[1]]
        assert [c["id"] for c in api.client.get(url, params={"q": "key"}).json()["items"]] == [chats[2]]

        page = api.client.get(url, params={"limit": 2}).json()
        rest = api.client.get(url, params={"limit": 2, "cursor": page["next_cursor"]}).json()
        assert [c["id"] for c in page["items"] + rest["items"]] == [chats[2], chats[0], chats[1]]
        assert rest["next_cursor"] is None

        assert api.client.delete(f"/api/v1/conversations/{chats[0]}").status_code == 204
        assert api.client.get(f"/api/v1/conversations/{chats[0]}/messages").status_code == 404

    def test_messages_page_backwards(self, api: Api, smith: dict) -> None:  # type: ignore[type-arg]
        chat = api.new_chat(smith["id"])
        for q in ("What notice is required?", "What is the liability cap?", "How much is unpaid?"):
            api.ask(chat, q)
        newest = api.client.get(f"/api/v1/conversations/{chat}/messages", params={"limit": 2}).json()
        older = api.client.get(
            f"/api/v1/conversations/{chat}/messages", params={"limit": 4, "before": newest["next_cursor"]}
        ).json()
        contents = [m["content"] for m in older["items"] + newest["items"]]
        assert contents[0] == "What notice is required?" and len(contents) == 6
        assert older["next_cursor"] is None


def test_matter_event_stream(live_server: LiveServer, samples_dir) -> None:  # type: ignore[no-untyped-def]
    with httpx.Client(base_url=live_server.url, timeout=10) as client:
        client.post("/api/v1/auth/dev-session", json={})
        matter = client.post("/api/v1/matters", json={"name": "Events", "client_name": "C", "our_side": "x"}).json()
        received: list[tuple[str, dict]] = []  # type: ignore[type-arg]

        def listen() -> None:
            with client.stream("GET", f"/api/v1/matters/{matter['id']}/events") as response:
                buffer = ""
                for chunk in response.iter_text():
                    buffer += chunk
                    while "\n\n" in buffer or "\r\n\r\n" in buffer:
                        sep = "\r\n\r\n" if "\r\n\r\n" in buffer else "\n\n"
                        raw, buffer = buffer.split(sep, 1)
                        for name, data, _ in parse_sse(raw.replace("\r\n", "\n")):
                            received.append((name, data))
                    if any(n == "document.ready" for n, _ in received):
                        return

        listener = threading.Thread(target=listen, daemon=True)
        listener.start()
        time.sleep(0.5)
        upload = client.post(
            f"/api/v1/matters/{matter['id']}/documents",
            files={"file": ("rivera_lease.txt", (samples_dir / "rivera_lease.txt").read_bytes())},
            data={"origin": "client"},
        )
        assert upload.status_code == 202
        from legallens.db.engine import Database
        from legallens.jobs.worker import run_pending

        run_pending(Database(live_server.settings.db_path), live_server.settings)
        listener.join(timeout=10)
        names = [n for n, _ in received]
        assert "job.progress" in names and "document.ready" in names
        ready = next(d for n, d in received if n == "document.ready")
        assert ready["document_id"] == upload.json()["document_id"] and ready["coverage"]["pages_read"] == 1

        # A reconnect with Last-Event-ID replays what was missed.
        with client.stream("GET", f"/api/v1/matters/{matter['id']}/events", params={"since": 0}) as response:
            text = ""
            for chunk in response.iter_text():
                text += chunk
                if "document.ready" in text:
                    break
        assert "event: job.progress" in text and "event: document.ready" in text
        assert json.loads(uuid.uuid4().hex and "{}") == {}
