import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and } from "drizzle-orm";
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

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Belum login" });
    return;
  }
  next();
}

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, req.session.userId!))
    .orderBy(desc(conversationsTable.updatedAt));
  res.json(conversations);
});

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conversation] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title, model: parsed.data.model, userId: req.session.userId! })
    .returning();

  res.status(201).json(conversation);
});

router.get("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.session.userId!)));

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

router.delete("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.session.userId!)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
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
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.session.userId!)));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  });

  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date(), model: body.data.model })
    .where(eq(conversationsTable.id, params.data.id));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const model = body.data.model;
  const userContent = body.data.content;

  let fullResponse = "";

  try {
    if (model === "wormgpt") {
      const apiUrl = `https://api-nanzz.my.id/docs/api/ai/worm-gpt.php?prompt=${encodeURIComponent(userContent)}`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(60000) });
      const data = await apiRes.json() as { result?: { response?: string; success?: boolean }; [key: string]: unknown };
      fullResponse = data?.result?.response || "Maaf, tidak ada respons dari WormGPT.";
    } else {
      const apiUrl = `https://api-nanzz.my.id/docs/api/ai/chat-gpt.php?text=${encodeURIComponent(userContent)}&model=chatgpt`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(60000) });
      const data = await apiRes.json() as { result?: { text?: string; model?: string }; [key: string]: unknown };
      fullResponse = data?.result?.text || "Maaf, tidak ada respons dari GPT.";
    }

    const words = fullResponse.split(" ");
    for (const word of words) {
      res.write(`data: ${JSON.stringify({ content: word + " " })}\n\n`);
      await new Promise(r => setTimeout(r, 25));
    }

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
