# Intent Classification Prompt

## Overview
This prompt classifies user messages into one of three primary intents: **ask**, **draft**, or **summarize**. The classification determines what the LegalLens orchestrator does next:
- **ask**: Answer a question by searching the documents and citing relevant passages
- **draft**: Generate a legal document (letter, memo, response, etc.) based on documents
- **summarize**: Create a concise summary of a specific document

## Classification Criteria

### ASK Intent
**When to classify as ASK:**
- User is asking a question about the documents
- User wants information, clarification, or analysis
- User wants to understand what documents say
- Keywords: "how", "what", "when", "why", "does", "is", "explain", "find", "show me", "tell me", "look up"
- Examples:
  - "How must a termination notice be delivered?"
  - "What are the key dates in this contract?"
  - "Does this agreement include a non-compete clause?"
  - "When is payment due?"

### DRAFT Intent
**When to classify as DRAFT:**
- User wants to generate or write a new document
- User is asking for a legal document to be created
- User references document types: letter, memo, response, reply, pleading, motion
- Keywords: "draft", "write", "prepare", "respond to", "reply to", "create", "compose", "generate"
- Examples:
  - "Draft a response to this demand letter"
  - "Write a memo summarizing our obligations"
  - "Prepare a reply to the other party's notice"
  - "Create a termination notice"

### SUMMARIZE Intent
**When to classify as SUMMARIZE:**
- User wants a condensed overview or digest of a document
- User wants key points extracted
- User is not asking a question but wants summary information
- Keywords: "summarize", "summary", "digest", "key points", "brief me", "overview", "synopsis"
- Examples:
  - "Summarize this contract"
  - "Give me a brief digest of the complaint"
  - "What are the key points of this document?"
  - "Create a short summary of the pleading"

## Ambiguous Cases & Confidence Scoring

**Lower Confidence (0.6-0.8):**
- Short messages with minimal context
- Messages that could fit multiple intents
- Messages with pronouns referencing previous context ("it", "that", "this")
- Examples:
  - "What about liability?" (depends on previous context)
  - "And the timeline?" (follow-up question)

**Higher Confidence (0.8-1.0):**
- Clear intent keywords present
- Explicit references to action or document type
- Full context provided in a single message
- Examples:
  - "Draft a termination notice" (clear draft)
  - "Summarize the lease agreement" (clear summarize)

## Context Considerations

The classifier reads:
1. **Current message** — The user's question or request
2. **Conversation history** — Up to 6 recent turns (oldest first)
3. **Matter information** — Client name, matter name, jurisdiction
4. **Available documents** — Document names and count

The classifier does NOT read document content; it uses only metadata and the message.

## Model and Temperature

- **Model**: Claude Haiku (fast, accurate for classification)
- **Temperature**: 0 (deterministic, focused on intent)
- **Output**: Structured JSON with `intent` and `confidence` fields
