"""Matter isolation (DEC-24, DEC-53, RISK-04): no search, answer, citation, stream or draft for one matter ever
uses another matter's documents, and a second lawyer can never reach the first one's data."""

from sqlalchemy import text

from legallens.db.scope import set_scope
from legallens.models.embedder import HashEmbedder
from legallens.search.hybrid import hybrid_search
from tests.conftest import EMBED_DIM, Api

ALPHA = "The escrow agent shall hold the deposit of $750,000 under code word FALCON-ALPHA until closing."
BRAVO = "The escrow agent shall hold the deposit of $990,000 under code word FALCON-BRAVO until closing."


def _two_matters(api: Api) -> tuple[dict, dict]:  # type: ignore[type-arg]
    a = api.create_matter("Alpha matter")
    b = api.create_matter("Bravo matter")
    assert api.upload(a["id"], "escrow.txt", "client", f"ESCROW TERMS\n\n1.1 {ALPHA}".encode()).status_code == 202
    assert api.upload(b["id"], "escrow.txt", "client", f"ESCROW TERMS\n\n1.1 {BRAVO}".encode()).status_code == 202
    api.run_jobs()
    return a, b


def test_search_never_crosses_matters(api: Api) -> None:
    a, b = _two_matters(api)
    for matter, own, other in ((a, "ALPHA", "BRAVO"), (b, "BRAVO", "ALPHA")):
        with api.database.read() as db:
            set_scope(db, matter["id"])
            result = hybrid_search(
                db, HashEmbedder(EMBED_DIM), matter_id=matter["id"], query="escrow deposit code word falcon"
            )
        texts = " ".join(h.text for h in result.hits)
        assert own in texts and other not in texts
        assert result.bm25 and result.vector


def test_answers_and_citations_stay_in_their_matter(api: Api) -> None:
    a, b = _two_matters(api)
    for matter, own, other in ((a, "FALCON-ALPHA", "FALCON-BRAVO"), (b, "FALCON-BRAVO", "FALCON-ALPHA")):
        turn = api.ask(api.new_chat(matter["id"]), "What is the escrow code word and deposit?")
        everything = turn.answer["content"] + str(turn.events) + str(turn.answer["citations"])
        assert own in everything and other not in everything
        docs = {d["id"] for d in api.client.get(f"/api/v1/matters/{matter['id']}/documents").json()["items"]}
        assert {c["document_id"] for c in turn.answer["citations"]} <= docs


def test_scope_cannot_name_another_matters_document(api: Api) -> None:
    a, b = _two_matters(api)
    b_doc = api.client.get(f"/api/v1/matters/{b['id']}/documents").json()["items"][0]["id"]
    chat = api.new_chat(a["id"])
    response = api.client.post(
        f"/api/v1/conversations/{chat}/messages",
        json={"content": "code word?", "scope": {"kind": "documents", "document_ids": [b_doc]}},
        headers={"Idempotency-Key": "x"},
    )
    assert (response.status_code, response.json()["code"]) == (422, "invalid_scope")
    response = api.client.post(
        f"/api/v1/conversations/{chat}/messages",
        json={"content": "draft a reply", "mode": "draft", "options": {"incoming_document_id": b_doc}},
        headers={"Idempotency-Key": "y"},
    )
    assert (response.status_code, response.json()["code"]) == (422, "invalid_option")


def test_vectors_are_partitioned_by_matter(api: Api) -> None:
    a, b = _two_matters(api)
    with api.database.read() as db:
        rows = db.execute(text("SELECT matter_id, count(*) FROM chunks_vec GROUP BY matter_id")).all()
    assert {row[0] for row in rows} == {a["id"], b["id"]}


def test_another_lawyer_gets_403_everywhere(api: Api, other_api: Api) -> None:
    mine = api.create_matter("Mine")
    [doc] = api.ingest(mine["id"], "smith_msa_v3.pdf")
    chat = api.new_chat(mine["id"])
    turn = api.ask(chat, "What notice is needed to terminate?")
    citation = turn.answer["citations"][0]["id"]
    summary = api.client.post(f"/api/v1/documents/{doc}/summaries", json={"template": "letter_demand"}).json()
    job = api.client.post(f"/api/v1/matters/{mine['id']}/export").json()["job_id"]
    draft = api.client.post(
        f"/api/v1/matters/{mine['id']}/drafts", json={"type": "memo", "incoming_document_id": doc}
    ).json()["draft_id"]
    api.run_jobs()
    section = api.client.get(f"/api/v1/drafts/{draft}").json()["sections"][0]["id"]

    c = other_api.client
    attempts = [
        c.get(f"/api/v1/matters/{mine['id']}"),
        c.patch(f"/api/v1/matters/{mine['id']}", json={"name": "x"}),
        c.get(f"/api/v1/matters/{mine['id']}/conversations"),
        c.get(f"/api/v1/matters/{mine['id']}/documents"),
        c.get(f"/api/v1/matters/{mine['id']}/summaries"),
        c.get(f"/api/v1/matters/{mine['id']}/drafts"),
        c.get(f"/api/v1/matters/{mine['id']}/audit"),
        c.get(f"/api/v1/matters/{mine['id']}/events"),
        c.post(
            f"/api/v1/matters/{mine['id']}/documents",
            files={"file": ("a.txt", b"hello there")},
            data={"origin": "client"},
        ),
        c.get(f"/api/v1/documents/{doc}"),
        c.get(f"/api/v1/documents/{doc}/file"),
        c.get(f"/api/v1/documents/{doc}/pages"),
        c.get(f"/api/v1/documents/{doc}/hidden-content"),
        c.delete(f"/api/v1/documents/{doc}"),
        c.get(f"/api/v1/conversations/{chat}/messages"),
        c.post(f"/api/v1/conversations/{chat}/messages", json={"content": "hi"}, headers={"Idempotency-Key": "z"}),
        c.get(turn.accepted["stream_url"]),
        c.post(f"/api/v1/runs/{turn.accepted['run_id']}/cancel"),
        c.get(f"/api/v1/citations/{citation}"),
        c.post(f"/api/v1/messages/{turn.answer['id']}/feedback", json={"kind": "helpful"}),
        c.get(f"/api/v1/summaries/{summary['summary_id']}"),
        c.post(f"/api/v1/summaries/{summary['summary_id']}/export"),
        c.post(f"/api/v1/matters/{mine['id']}/drafts", json={"type": "memo", "incoming_document_id": doc}),
        c.get(f"/api/v1/drafts/{draft}"),
        c.patch(f"/api/v1/drafts/{draft}", json={"base_version": 1, "acknowledge": []}),
        c.get(f"/api/v1/drafts/{draft}/checks"),
        c.post(f"/api/v1/drafts/{draft}/sections/{section}/propose", json={"instruction": "x"}),
        c.post(f"/api/v1/drafts/{draft}/sections/{section}/regenerate", json={"instruction": "x"}),
        c.post(f"/api/v1/drafts/{draft}/claims/c1/propose"),
        c.post(f"/api/v1/drafts/{draft}/review", json={"confirm": True}),
        c.post(f"/api/v1/drafts/{draft}/export", params={"kind": "working"}),
        c.get(f"/api/v1/jobs/{job}"),
        c.post(f"/api/v1/jobs/{job}/cancel"),
        c.delete(f"/api/v1/matters/{mine['id']}", params={"confirm": "Mine"}),
    ]
    assert [r.status_code for r in attempts] == [403] * len(attempts), [
        (r.request.method, r.request.url.path, r.status_code) for r in attempts if r.status_code != 403
    ]
