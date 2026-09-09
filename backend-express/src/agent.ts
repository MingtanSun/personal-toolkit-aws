import { ChatOpenAI } from "@langchain/openai";
import { config } from './config.js';
import { createAgent, tool } from "langchain";
import { z } from "zod";
import {
    calculateCostMonthly,
    getAllSubscriptions,
    getParticularSubscription,
    getTheMostExpensiveSubscription,
    getUpcomingSubscriptions
} from './agentTools.js';
import { MemorySaver } from "@langchain/langgraph";

function toPublicSubscription(subscription: Awaited<ReturnType<typeof getAllSubscriptions>>[number]) {
    return {
        serviceName: subscription.serviceName,
        planName: subscription.planName,
        billingCycle: subscription.billingCycle,
        amount: subscription.amount,
        currency: subscription.currency,
        firstPaymentDate: subscription.firstPaymentDate,
        websiteUrl: subscription.websiteUrl,
        notes: subscription.notes
    };
}

const contextSchema = z.object({
    userId: z.string()
});

const checkpointer = new MemorySaver();

const model = new ChatOpenAI({
    model: 'deepseek-v4-flash',
    apiKey: config.deepseekApiKey,
    configuration: {
        baseURL: "https://api.deepseek.com"
    },
    modelKwargs: {
        thinking: {
            type: "disabled"
        }
    }
});

const getMonthlyCostTool = tool(
    async (_input, runtime) => {
        const context = runtime.context;
        const totalCost = await calculateCostMonthly(context.userId);

        return JSON.stringify({ totalCost });
    },
    {
        name: 'calculate_monthly_subscription_spend',
        description: "Returns the total amount of the user's stored subscriptions whose billing cycle is monthly. " +
            "Use this tool when the user asks how much they spend on monthly subscriptions. " +
            "It does not convert yearly subscriptions into a monthly equivalent.",
        schema: z.object({})
    }
)

const getMostExpensiveSubscriptionTool = tool(
    async (_input, runtime) => {
        const context = runtime.context;
        const [amount, serviceName] = await getTheMostExpensiveSubscription(context.userId);
        return JSON.stringify({ amount, serviceName });
    },
    {
        name: "get_the_most_expensive_subscription",
        description: "Returns the service name and stored amount of the user's subscription with the highest amount. " +
            "Use this tool when the user asks which subscription has the highest price.",
        schema: z.object({})
    }
)
const checkDuplicatesInSubscriptionsTool = tool(
    async (_input, runtime) => {
        const context = runtime.context;
        const subscriptions = await getAllSubscriptions(context.userId);
        return JSON.stringify(subscriptions.map(toPublicSubscription));
    },
    {
        name: "get_subscriptions_for_duplicate_check",
        description: "Returns all of the user's stored subscriptions for duplicate comparison. " +
            "Use this tool when the user asks whether they have duplicate or similar subscriptions.",
        schema: z.object({})
    }
);
const getSubscriptionByNameTool = tool(
    async (input, runtime) => {
        const context = runtime.context;
        const possibleServiceName = input.serviceName;
        const result = await getParticularSubscription(context.userId, possibleServiceName);

        return JSON.stringify(result.map(toPublicSubscription));

    },
    {
        name: 'find_subscriptions_by_possible_names',
        description: "Returns stored subscriptions whose service names match one of the supplied candidate names. " +
            "Use this tool when the user asks about a specific subscription, including when its name may be incomplete or misspelled.",
        schema: z.object({
            serviceName: z.array(z.string()).min(1).max(5).describe(
                "One to five possible service names inferred from the user's wording, including the original name and likely spelling corrections"
            )
        })
    }
)

const upcomingSubscriptionsTool = tool(
    async (input, runtime) => {
        const context = runtime.context;
        const days = input.days;
        const result = await getUpcomingSubscriptions(context.userId, days);
        return JSON.stringify(result.map(subscription => ({
            ...toPublicSubscription(subscription),
            nextPaymentDate: subscription.nextPaymentDate
        })));

    },
    {
        name: "get_upcoming_subscription_payments",
        description: "Returns the user's monthly or yearly subscriptions that will renew within a specified number of days. " +
            "Use this tool when the user asks about upcoming subscription payments or renewals.",
        schema: z.object({
            days: z.number().int().min(1).describe(
                "The positive number of calendar days to check ahead; payments due today are also included"
            )
        })
    }
)


const agent = createAgent({
    model,
    tools: [getMostExpensiveSubscriptionTool, getMonthlyCostTool, checkDuplicatesInSubscriptionsTool, getSubscriptionByNameTool, upcomingSubscriptionsTool],
    contextSchema,
    systemPrompt: `
    You are a subscription assistant. Use tools whenever the user asks about their stored subscription data.
    Base answers about stored subscriptions only on tool results. Never expose PK, SK, userId, or other internal fields.
    Do not invent amounts, currencies, plans, billing cycles, payment dates, or other subscription information.

    When checking possible duplicate or similar subscriptions:
    - Reply in no more than two sentences.
    - If there are no duplicates or similar subscriptions, say exactly: "No similar or duplicated subscriptions found."
    - If duplicated or similar subscriptions exist, list no more than three possible duplicate pairs.
    - For each pair, briefly explain why they may be the same service.
    - Do not mention PK, SK, userId, or other internal fields.
    - Do not invent currency or billing details.
    For other requests, reply as usual.

    When the user asks about a specific subscription:
    - Always use the find_subscriptions_by_possible_names tool.
    - Infer between one and five possible service names from the user's input.
    - Include the user's original service name and likely corrected spellings or common name variations.
    - Do not include unrelated service names.
    - Only claim that a subscription exists when it is returned by the tool.
    - If no subscription is returned, say exactly: "No matching subscription found."
    - If one subscription is returned, answer using only its stored information.
    - If multiple subscriptions are returned, briefly list the possible matches and ask the user which one they mean.
    - Reply in no more than three sentences.
    - Do not mention tool names or other internal implementation details.
    `,
    checkpointer
});


export async function askModel(message: string, conversationId: string, userId: string): Promise<string> {
    const result = await agent.invoke(
        {
            messages: [{
                role: 'user',
                content: message
            }]
        },
        {
            context: {
                userId
            },
            configurable: {
                thread_id: `${userId}:${conversationId}`
            }
        }
    );
    const finalResponse = result.messages.at(-1)!.content as string;
    return finalResponse;
}
