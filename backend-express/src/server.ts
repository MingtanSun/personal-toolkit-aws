import cors from "cors";
import express from "express";
import multer from "multer";
import { authenticate, type UserRequest } from "./auth.js";
import { config } from "./config.js";
import {
  addTask,
  editTask,
  getTasks,
  removeTask,
  type TaskChanges,
  type TaskPriority
} from "./tasks.js";
import { addSubscription, loadSubscription, deleteSubscription, updateSubscription, analyzeSubscriptionImage } from "./subscription.js";
import { askModel } from './agent.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "clouddesk-api" });
});

// Everything below this line requires a Cognito access token.
app.use("/api/v1", authenticate);

app.get("/api/v1/tasks", async (req, res) => {
  const userId = (req as UserRequest).userId!;
  res.json(await getTasks(userId));
});

app.post("/api/v1/tasks", async (req, res) => {
  const userId = (req as UserRequest).userId!;
  const title = String(req.body.title || "").trim();
  const priority = req.body.priority || "normal";

  if (!title) {
    res.status(400).json({ message: "Title is required" });
    return;
  }

  if (!["low", "normal", "high"].includes(priority)) {
    res.status(400).json({ message: "Priority must be low, normal, or high" });
    return;
  }

  const task = await addTask(userId, title, priority as TaskPriority);
  res.status(201).json({ message: "Task created", task });
});

app.patch("/api/v1/tasks/:taskId", async (req, res) => {
  const userId = (req as UserRequest).userId!;
  const changes: TaskChanges = {};

  if (typeof req.body.title === "string" && req.body.title.trim()) {
    changes.title = req.body.title.trim();
  }
  if (typeof req.body.completed === "boolean") {
    changes.completed = req.body.completed;
  }
  if (typeof req.body.starred === "boolean") {
    changes.starred = req.body.starred;
  }
  if (["low", "normal", "high"].includes(req.body.priority)) {
    changes.priority = req.body.priority;
  }

  if (Object.keys(changes).length === 0) {
    res.status(400).json({ message: "Send at least one task field to update" });
    return;
  }

  const task = await editTask(userId, req.params.taskId, changes);

  if (!task) {
    res.status(404).json({ message: "Task not found" });
    return;
  }

  res.json({ message: "Task updated", task });
});

app.delete("/api/v1/tasks/:taskId", async (req, res) => {
  const userId = (req as UserRequest).userId!;
  await removeTask(userId, req.params.taskId);
  res.json({ message: "Task deleted" });
});

const upload = multer({
  storage: multer.memoryStorage()
});

app.post('/api/v1/subscription/analyze',
  upload.single("screenshot"),
  async (req, res, next) => {
    const userId = (req as UserRequest).userId!;
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        message: "No image uploaded"
      });
    }
    const base64Image = req.file!.buffer.toString("base64");
    const subscriptions = await loadSubscription(userId);
    //console.log(subscriptions);
    const result = await analyzeSubscriptionImage(req.file!.mimetype, base64Image, subscriptions);
    console.log(result);
    return res.status(201).json(result);
  });

app.post('/api/v1/subscription/submit', async (req, res, next) => {
  const userId = (req as UserRequest).userId!;
  console.log(req.body);
  const serviceName = req.body.serviceName;
  const planName = req.body.planName;
  const billingCycle = req.body.billingCycle;
  const amount = req.body.amount;
  const currency = req.body.currency;
  const firstPaymentDate = req.body.firstPaymentDate;
  const websiteUrl = req.body.websiteUrl;
  const notes = req.body.notes;
  const entry = await addSubscription(
    userId,
    serviceName,
    planName,
    billingCycle,
    amount,
    currency,
    firstPaymentDate,
    websiteUrl,
    notes
  );
  console.log(entry);
  res.status(201).json({
    message: 'successfully submit',
    data: entry
  });
});

app.get('/api/v1/subscription', async (req, res, next) => {
  const userId = (req as UserRequest).userId!;
  try {
    const subscriptions = await loadSubscription(userId);
    res.status(200).json(subscriptions);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Could not load subscription"
    });
  }
});

app.delete('/api/v1/subscription', async (req, res, _next) => {
  const userId = (req as UserRequest).userId!;
  const SK = req.body.SK;
  try {
    await deleteSubscription(userId, SK);
    res.status(200).json({
      message: "Subscription deleted"
    });
  } catch (error) {

    res.status(500).json({
      message: "Could not delete subscription"
    });
  }
});

app.put('/api/v1/subscription', async (req, res, _next) => {
  const userId = (req as UserRequest).userId!;
  const SK = req.body.SK;
  const newServiceName = req.body.serviceName;
  const newPlanName = req.body.planName;
  const newBillingCycle = req.body.billingCycle;
  const newAmount = req.body.amount;
  const newCurrency = req.body.currency;
  const newFirstPaymentDate = req.body.firstPaymentDate;
  const newWebsiteUrl = req.body.websiteUrl;
  const newNotes = req.body.notes;
  if (newServiceName === undefined || newServiceName === null) {
    return res.status(400).json({ message: 'input not valid' });
  }
  try {
    await updateSubscription(
      userId,
      SK,
      newServiceName,
      newPlanName,
      newBillingCycle,
      newAmount,
      newCurrency,
      newFirstPaymentDate,
      newWebsiteUrl,
      newNotes
    );
    res.status(200).json({
      message: "Subscription updated"
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Could not update subscription Info"
    });
  }


});

app.post('/api/v1/agent/message', async (req, res) => {
  const userId = (req as UserRequest).userId!;
  const conversationId = typeof req.body.conversationId === "string"
    ? req.body.conversationId.trim()
    : "";
  const message = typeof req.body.message === "string"
    ? req.body.message.trim()
    : "";

  if (!conversationId || !message) {
    return res.status(400).json({
      message: "Message and conversationId are required"
    });
  }

  const response = await askModel(message, conversationId, userId);
  return res.status(200).json({
    reply: response
  });
});

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`CloudDesk API is running on port ${config.port}`);
});
