import path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { config } from './config.js';
import { createAgent, tool, humanInTheLoopMiddleware, modelCallLimitMiddleware, HITLRequest } from "langchain";
import { z, } from "zod";
import {
    calculateCostMonthly,
    getAllSubscriptions,
    getParticularSubscription,
    getTheMostExpensiveSubscription,
    getUpcomingSubscriptions
} from './agentTools.js';
import { isInterrupted } from "@langchain/langgraph";
import {
  SqliteSaver
} from "@langchain/langgraph-checkpoint-sqlite";
import { deleteSubscription, updateSubscriptionAmount } from './subscription.js';
import { searchSubscriptionKnowledge } from "./pinecone.js";
import {
    Command,
    type StateSnapshot
} from "@langchain/langgraph";



function toPublicSubscription(subscription: Awaited<ReturnType<typeof getAllSubscriptions>>[number]) {
    return {
        SK: subscription.SK,
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

const checkpointPath =
  path.resolve(config.agentCheckpointDbPath);

const checkpointer = SqliteSaver.fromConnString(
  checkpointPath
);

const model = new ChatOpenAI({
    model: 'deepseek-v4-pro',
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

        return JSON.stringify(result);

    },
    {
        name: 'find_subscriptions_by_possible_names',
        description: "Finds subscription records stored in this application whose service names match one of the supplied candidate names. " +
            "Use it for questions about stored details such as amount, currency, plan, billing cycle, payment date, website, or notes, " +
            "and when preparing an update or deletion of a stored record. " +
            "Do not use it for provider cancellation instructions, refunds, invoices, trials, or other policy questions.",
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
);

const updateCommandTool = tool(
    async (input, runtime) => {
        const context = runtime.context;
        const subsId = input.subsId;
        const amount = input.amount;
        const result = await updateSubscriptionAmount(context.userId, subsId, amount);
        return JSON.stringify(result);
    },
    {
        name: 'update_subscription_amount',
        description: "Updates the amount of one stored subscription using its SK. " +
            "Use this tool after the subscription has been uniquely identified and the user has requested a specific new amount. " +
            "The application will require human approval before executing the update.",
        schema: z.object({
            subsId: z.string().describe('The exact SK returned by the subscription lookup tool'),
            amount: z.number().describe('The new subscription amount requested by the user')
        })
    }
)

const deleteSubscriptionTool = tool(
    async (input, runtime) => {
        const context = runtime.context;
        const result = await deleteSubscription(context.userId, input.subsId);
        return JSON.stringify(result);
    },
    {
        name: 'delete_subscription',
        description: "Permanently deletes one subscription record stored in this application using its SK. " +
            "It does not cancel a real subscription with Spotify, Netflix, Adobe, or any external provider. " +
            "Only use it after the user explicitly asks to remove or delete the record from this app, tracker, list, or stored data, " +
            "and the record has been uniquely identified. The application will require human approval before executing the deletion.",
        schema: z.object({
            subsId: z.string().describe('The exact SK returned by the subscription lookup tool')
        })
    }
);

const searchSubscriptionPolicyTool = tool(
    async (input, _runtime) => {
        const text = input.text;
        const serviceName = input.serviceName;
        const result = await searchSubscriptionKnowledge(text, serviceName);
        return JSON.stringify(result);
    },
    {
        name: "search_subscription_policy",
        description:
            "Read-only search for official subscription-provider policies and help information, " +
            "including how to cancel an external service, request a refund, view invoices, understand billing or trials, and compare plan types. " +
            "Use it when the user asks how to cancel, end, or stop a subscription with Spotify, Netflix, Adobe, or another provider. " +
            "This tool does not modify or delete any subscription record stored in this application.",
        schema: z.object({
            text: z.string().describe(`The user's question about a subscription service policy or procedure`),
            serviceName: z.enum([
                "Adobe Creative Cloud",
                "Amazon Prime",
                "Apple Subscriptions",
                "ChatGPT",
                "Codecademy",
                "Disney+",
                "Hulu",
                "Microsoft 365",
                "Netflix",
                "Spotify",
                "YouTube Premium",
            ]).describe(
                "The subscription service mentioned by the user. Select the matching supported service."
            )
        })
    }
)


const agent = createAgent({
    model,
    tools: [getMostExpensiveSubscriptionTool, getMonthlyCostTool, checkDuplicatesInSubscriptionsTool, getSubscriptionByNameTool, upcomingSubscriptionsTool, updateCommandTool, deleteSubscriptionTool, searchSubscriptionPolicyTool],
    middleware: [
        modelCallLimitMiddleware({
            runLimit: 3,
            threadLimit: 30,
            exitBehavior: 'end'
        }),

        humanInTheLoopMiddleware({
            interruptOn: {
                update_subscription_amount: {
                    allowedDecisions: ['approve', 'reject']
                },
                delete_subscription: {
                    allowedDecisions: ['approve', 'reject']
                }
            },
            descriptionPrefix: 'Subscription change pending approval'
        })
    ],
    contextSchema,
    systemPrompt: `
    You are a subscription-management assistant. Only handle questions and actions related to subscriptions.

    Core rules:
    - Use tools whenever the user asks about stored subscription data or provider policies.
    - Base stored-data answers only on tool results.
    - Never expose PK, SK, userId, or other internal fields.
    - Never invent amounts, currencies, plans, billing cycles, payment dates, policies, or tool results.

    Intent routing and priority:
    1. Provider policy requests have priority over stored-subscription lookup.
       Words such as "cancel", "end", or "stop" followed by a provider or plan normally mean canceling the real subscription with the external provider.
       Example: "How do I cancel Spotify Premium?" is a provider-policy request. Use search_subscription_policy directly.
       Do not use find_subscriptions_by_possible_names or delete_subscription for that request.
       Do not ask whether the user wants to delete the stored record, and do not offer stored-record deletion as an alternative.

    2. Stored subscription details include the user's saved amount, currency, plan, billing cycle, payment date, website, or notes.
       Use find_subscriptions_by_possible_names for these questions.
       The word "my" by itself does not turn a provider-policy question into a stored-data question.

    3. Stored-record deletion is different from provider cancellation.
       Only start the deletion workflow when the user explicitly asks to remove or delete a subscription from this app, tracker, list, or stored data.
       Never interpret "cancel my subscription" by itself as permission to delete a stored record.

    4. If wording is genuinely ambiguous and the preceding rules do not resolve it, ask one short clarifying question before using a write tool.

    Provider policy requests:
    - Use search_subscription_policy for cancellation instructions, refunds, invoices, referrals, subscription types, trials, billing rules, and other provider procedures.
    - Base the answer only on retrieved information, not general model knowledge.
    - If the information is missing or insufficient, say: "I couldn't find relevant policy information for that subscription service."
    - Include an official source URL when one is returned.
    - Keep the answer concise. Do not mention tools, vector databases, chunks, or similarity scores.
    -Do not add recommendations or policy details that are not explicitly supported by the retrieved knowledge.

    Stored subscription lookup:
    - Infer one to five possible service names, including the user's wording and likely corrections, but do not add unrelated services.
    - Only claim that a stored subscription exists when the lookup returns it.
    - If none is returned, say exactly: "No matching subscription found."
    - If one is returned, answer using only its stored information.
    - If several are returned, list the possible matches briefly and ask which one the user means.
    - Reply in no more than three sentences and do not mention internal implementation details.

    Duplicate checks:
    - Reply in no more than two sentences.
    - If there are no duplicates or similar subscriptions, say exactly: "No similar or duplicated subscriptions found."
    - Otherwise, list no more than three possible duplicate pairs and briefly explain each match.
    - Do not expose internal fields or invent billing details.

    Amount updates:
    - First use find_subscriptions_by_possible_names.
    - If no record is found, report that no matching subscription was found and do not call the update tool.
    - If several records are found, list the possible matches briefly, ask which one the user means, and do not call the update tool.
    - If exactly one record is found and the user supplied a specific new amount, call update_subscription_amount with the exact SK from the lookup result and the requested amount.
    - Do not ask for confirmation in a conversational response. The application will interrupt the tool call and request human approval before execution.
    - If an update is rejected, do not retry it unless the user makes a new update request.

    Stored-record deletion:
    - First use find_subscriptions_by_possible_names.
    - If no record is found, report that no matching subscription was found and do not call the deletion tool.
    - If several records are found, list the possible matches briefly, ask which one the user means, and do not call the deletion tool.
    - If exactly one record is found, call delete_subscription with the exact SK from the lookup result.
    - Do not ask for confirmation in a conversational response. The application will interrupt the tool call and request human approval before execution.
    - If a deletion is rejected, do not retry it unless the user makes a new deletion request.

    Out-of-scope requests:
    - If a request is unrelated to subscription management, reply exactly: "I can only help with subscription-related questions."
    - Do not provide unrelated essays, code, stories, translations, homework, marketing content, or general knowledge.
    `,
    checkpointer
});


export async function askModel(message: string, conversationId: string, userId: string): Promise<string> {


    const agentConfig = {
        context: {
            userId
        },
        configurable: {
            thread_id: `${userId}:${conversationId}`
        }
    };
    const state = await (agent.getState(agentConfig) as unknown as Promise<StateSnapshot>);
    const isWaitingApproval = state.tasks.some(task => task.interrupts.length > 0);
    const answer = message.trim().toLocaleLowerCase();
    try {
        if (answer === 'yes' && isWaitingApproval) {
            const result = await agent.invoke(
                new Command({
                    resume: {
                        decisions: [
                            {
                                type: "approve"
                            }
                        ]
                    }
                }),
                agentConfig
            );
            return result.messages.at(-1)?.content as string;
        } else if (answer === 'no' && isWaitingApproval) {
            const result = await agent.invoke(
                new Command({
                    resume: {
                        decisions: [
                            {
                                type: "reject"
                            }
                        ]
                    }
                }),
                agentConfig
            );
            return result.messages.at(-1)?.content as string;
        }
    } catch (error) {
        return 'something wrong';
    }

    if(isWaitingApproval){
        return 'Please reply yes or no';
    }

    const result = await agent.invoke(
        {
            messages: [{
                role: 'user',
                content: message
            }]
        },
        agentConfig
    );

    if (isInterrupted<HITLRequest>(result)) {
        const interrupt = result.__interrupt__[0];
        const request = interrupt!.value;
        const action = request?.actionRequests[0];
        const reviewConfig = request?.reviewConfigs[0];
        console.log(result.messages);
        console.log(request!.actionRequests!)

        return `Are you sure you want to do this? Please reply 'yes' or 'no'`;
    } else {
        const finalResponse = result.messages.at(-1)!.content as string;
        return finalResponse;
    }

}
