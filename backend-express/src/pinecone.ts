import { Pinecone } from '@pinecone-database/pinecone';
import { config } from './config.js'

const pc = new Pinecone({
    apiKey: config.pineconeApiKey
});
export const subscriptionKnowledgeIndex = pc.index({
    name: 'subscription-knowledge'
});

export async function searchSubscriptionKnowledge(query: string, serviceName: string) {
    const namespace = subscriptionKnowledgeIndex.namespace('knowledge-v1');
    const result = await namespace.searchRecords({
        query: {
            inputs: {
                text: query,
            },
            topK: 3,
            filter:{
                serviceName: {$eq: serviceName}
            }
        },
        fields: ["text", "sourceUrl"],
    });

    return result.result.hits;
}
