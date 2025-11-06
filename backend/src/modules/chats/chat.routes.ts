import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { chatService } from './chat.service.js';
import { HttpError } from '../../middleware/error-handler.js';

const createChatSchema = z.object({
  listingId: z.string().min(1),
  message: z.string().min(1).max(2000).optional()
});

const messageSchema = z.object({
  content: z.string().min(1).max(2000)
});

export const chatRouter = Router();

chatRouter.use(requireAuth);

chatRouter.get('/', async (req, res, next) => {
  try {
    const chats = await chatService.listForUser(req.user!);
    res.json(chats);
  } catch (error) {
    next(error);
  }
});

chatRouter.post('/', async (req, res, next) => {
  try {
    const body = createChatSchema.parse(req.body);
    const chat = await chatService.startChat(body.listingId, req.user!, body.message);
    res.status(201).json(chat);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    next(error);
  }
});

chatRouter.get('/:id', async (req, res, next) => {
  try {
    const chat = await chatService.getChat(req.params.id, req.user!);
    res.json(chat);
  } catch (error) {
    next(error);
  }
});

chatRouter.post('/:id/messages', async (req, res, next) => {
  try {
    const body = messageSchema.parse(req.body);
    const message = await chatService.sendMessage(req.params.id, req.user!, body.content);
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    next(error);
  }
});

chatRouter.post('/:id/read', async (req, res, next) => {
  try {
    await chatService.markRead(req.params.id, req.user!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

chatRouter.post('/:id/archive', async (req, res, next) => {
  try {
    const chat = await chatService.archiveChat(req.params.id, req.user!);
    res.json(chat);
  } catch (error) {
    next(error);
  }
});
