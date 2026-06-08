import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import {
  CreateConversationBody,
  GetConversationParams,
  DeleteConversationParams,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

router.get("/conversations", async (_req, res): Promise<void> => {
  const conversations = await db
    .select()
    .from(conversationsTable)
    .orderBy(desc(conversationsTable.updatedAt));
  res.json(conversations);
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conversation] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title, model: parsed.data.model })
    .returning();

  res.status(201).json(conversation);
});

router.get("/conversations/:id", async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);

  res.json({ ...conversation, messages: msgs });
});

router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Save user message
  await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  });

  // Update conversation updatedAt
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date(), model: body.data.model })
    .where(eq(conversationsTable.id, params.data.id));

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const model = body.data.model;
  const userContent = body.data.content;

  let fullResponse = "";

  try {
    if (model === "wormgpt") {
      // WormGPT API — response is at data.result.response
      const apiUrl = `https://api-nanzz.my.id/docs/api/ai/worm-gpt.php?prompt=${encodeURIComponent(userContent)}`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(60000) });
      const data = await apiRes.json() as { result?: { response?: string; success?: boolean }; [key: string]: unknown };
      
      fullResponse = data?.result?.response || "Maaf, tidak ada respons dari WormGPT.";
    } else {
      // GPT API — response is at data.result.text
      const apiUrl = `https://api-nanzz.my.id/docs/api/ai/chat-gpt.php?text=${encodeURIComponent(userContent)}&model=chatgpt`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(60000) });
      const data = await apiRes.json() as { result?: { text?: string; model?: string }; [key: string]: unknown };
      
      fullResponse = data?.result?.text || "Maaf, tidak ada respons dari GPT.";
    }

    // Stream word by word for realistic typing effect
    const words = fullResponse.split(" ");
    for (const word of words) {
      res.write(`data: ${JSON.stringify({ content: word + " " })}\n\n`);
      await new Promise(r => setTimeout(r, 25));
    }

    // Save assistant message
    await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: fullResponse.trim(),
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Error calling AI API");
    const errMsg = "Maaf, terjadi kesalahan saat menghubungi AI. Silakan coba lagi.";
    res.write(`data: ${JSON.stringify({ content: errMsg })}\n\n`);
    
    await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: errMsg,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

export default router;
