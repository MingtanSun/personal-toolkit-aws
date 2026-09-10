import { randomUUID } from "node:crypto";
import OpenAI from 'openai';

import {
    DeleteCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { config } from "./config.js";
import { dynamodb } from "./dynamodb.js";
import { success } from "zod";

export interface Subscriptions {
    firstPaymentDate: string | null;
    currency: string | null;
    serviceName: string | null;
    websiteUrl: string | null;
    notes: string | null;
    planName: string | null;
    billingCycle: string | null;
    amount: number | null;
    PK: string | null;
    SK: string | null;
}

export async function addSubscription(
    userId: string,
    serviceName: string,
    planName: string,
    billingCycle: string,
    amount: number,
    currency: string,
    firstPaymentDate: string,
    websiteUrl: string,
    notes: string
) {
    // userId 就是 Cognito 的 sub，用作用户隔离
    const SubsId = randomUUID();
    const item = {
        PK: `USER#${userId}`,
        SK: `SUBS#${SubsId}`,
        serviceName,
        planName,
        billingCycle,
        amount,
        currency,
        firstPaymentDate,
        websiteUrl,
        notes
    };
    await dynamodb.send(
        new PutCommand({
            TableName: config.subscriptionsTableName,
            Item: item
        })
    );
    return {
        SK: `SUBS#${SubsId}`,
        serviceName,
        planName,
        billingCycle,
        amount,
        currency,
        firstPaymentDate,
        websiteUrl,
        notes
    };
}

export async function loadSubscription(userId: string): Promise<Subscriptions[]> {
    const result = await dynamodb.send(
        new QueryCommand({
            TableName: config.subscriptionsTableName,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: {
                ":pk": `USER#${userId}`
            }
        })
    );

    const subscriptions = (result.Items || []) as Subscriptions[];
    return subscriptions;
}

export async function deleteSubscription(userId: string, SubsId: string): Promise<object> {
    try {
        await dynamodb.send(
            new DeleteCommand({
                TableName: config.subscriptionsTableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: SubsId
                }
            })
        );
        return {
            success: true
        };
    } catch (error) {
        return {
            success: false,
            message: 'something wrong with internal database operation'
        };
    }
}

export async function updateSubscription(
    userId: string,
    SubsId: string,
    serviceName: string,
    planName: string,
    billingCycle: string,
    amount: number,
    currency: string,
    firstPaymentDate: string,
    websiteUrl: string,
    notes: string
) {
    const result = await dynamodb.send(
        new PutCommand({
            TableName: config.subscriptionsTableName,
            Item: {
                PK: `USER#${userId}`,
                SK: SubsId,
                serviceName,
                planName,
                billingCycle,
                amount,
                currency,
                firstPaymentDate,
                websiteUrl,
                notes
            }
        })
    );
};

export async function updateSubscriptionAmount(userId: string,
    SubsId: string, updatedAmount: number): Promise<object> {
    if (!Number.isFinite(updatedAmount) || updatedAmount < 0) {
        return {
            success: false,
            reason: 'this is not a valid input number'
        };
    }
    try {
        await dynamodb.send(
            new UpdateCommand({
                TableName: config.subscriptionsTableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: SubsId
                },
                UpdateExpression: "SET #amount = :newAmount",
                ExpressionAttributeNames: {
                    "#amount": "amount"
                },
                ExpressionAttributeValues: {
                    ":newAmount": updatedAmount
                },
                ConditionExpression:
                    "attribute_exists(PK) AND attribute_exists(SK)",
            })
        )
        return {
            success: true,
            updatedAmount
        }
        ;
    } catch (error) {
        return {
            success: false,
            message: 'something wrong with internal database operation'
        }
    }
}


export async function analyzeSubscriptionImage(mimetype: string, base64Image: string, subscriptions: Subscriptions[]) {
    const deepseek = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: config.deepseekApiKey
    });

    const response = await deepseek.chat.completions.create({
        model: "deepseek-v4-flash-vision-exp",
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `
请分析用户上传的订阅服务截图，提取截图中明确显示的订阅信息，并返回英文结果。

用户当前已经保存的订阅如下：

${JSON.stringify(subscriptions)}

你需要完成两件事情：

1. 从截图中提取订阅信息。
2. 将截图中的服务与用户已经保存的订阅进行比较，判断是否可能存在相似订阅。

只返回一个合法的 JSON 对象，不要返回 Markdown、代码块、解释或其他文字。返回的所有内容都用英文

JSON 格式必须为：

{
  "serviceName": string | null,
  "planName": string | null,
  "billingCycle": "weekly" | "monthly" | "quarterly" | "yearly" | "one-time" | null,
  "amount": number | null,
  "currency": string | null,
  "firstPaymentDate": string | null,
  "websiteUrl": string | null,
  "notes": string | null,
  "similarSubscriptionWarning": string | null
}

字段说明和提取规则：

1. serviceName

订阅服务或公司的名称，例如 Codecademy、Netflix、Spotify。

只能根据截图中可见的信息填写。
无法确定时返回 null。

2. planName

用户订阅的套餐名称，例如 Plus、Premium、Individual。

不要把服务名称重复填写为套餐名称。
只能根据截图中可见的信息填写。
无法确定时返回 null。

3. billingCycle

订阅的付款周期。

只能使用以下值：

- weekly:每周付款
- monthly:每月付款
- quarterly:每三个月付款
- yearly:每年付款
- one-time:一次性付款
- null:无法判断

4. amount

每个付款周期的基础订阅金额。

只返回数字，不要包含货币符号、税费或付款周期。

例如：

CA$39.99/month

应该返回：

39.99

无法确定时返回 null。

5. currency

使用 ISO 货币代码，例如：

- CAD
- USD
- CNY
- EUR
- GBP

如果截图显示 CA$，返回 CAD。
无法确定币种时返回 null。

6. firstPaymentDate

第一次付款日期或订阅开始日期。

日期格式必须为：

YYYY-MM-DD

“Last payment”不能当作第一次付款日期。
截图中没有明确显示第一次付款日期或订阅开始日期时，返回 null。

7. websiteUrl

订阅服务的官方网站主页。

如果截图中显示了明确的域名，可以整理成主页地址，例如：

https://www.codecademy.com

不要返回用户账户、账单或设置页面的完整地址。
无法可靠确定官方网站时返回 null。

8. notes

使用简洁英文记录截图中显示的其他重要信息，例如：

- 税费
- 免费试用
- 优惠到期时间
- 自动续费
- 暂停信息

不要重复其他字段中已经保存的信息。
不要把相似订阅提醒写入 notes。
没有额外信息时返回 null。

9. similarSubscriptionWarning

将截图中识别出的订阅与用户已有订阅进行比较。

判断相似订阅时，可以综合比较：

- serviceName
- websiteUrl 中的服务域名
- planName

服务名称不需要完全一致。

例如：

- "Netflix" 和 "Netflix Canada" 可以认为可能是同一个服务。
- "Codecademy" 和 "Codecademy Plus" 可以认为可能是同一个服务。

如果可能存在相似订阅，返回一条简短的英文提醒。

如果已有订阅与截图中的订阅基本相同，可以返回：

"A similar Netflix subscription may already exist. Please review it before saving."

如果发现套餐、付款周期、金额或者货币可能发生变化，需要在提醒中说明变化，例如：

"A similar Netflix subscription may already exist. The amount appears to have changed from CAD 20.99 to CAD 24.99. Please review it before saving."

或者：

"A similar Codecademy subscription may already exist. The plan name and billing cycle appear to be different. Please review it before saving."

提醒最多使用两句话。

如果存在多条相似订阅，只需要说明可能存在相似订阅，不需要列出所有记录。

如果没有发现相似订阅，返回 null。

比较要求：

- 用户已有订阅只能用于判断是否可能存在相似订阅。
- 不要使用已有订阅中的内容补全截图里缺失的字段。
- 不要为了匹配已有订阅而修改从截图中提取的结果。
- serviceName、planName、billingCycle、amount、currency、firstPaymentDate、websiteUrl 和 notes 必须来自截图。
- similarSubscriptionWarning 可以同时参考截图和已有订阅。

通用要求：

- 不确定的截图字段必须返回 null,不要猜测。
- 金额必须是 number 类型，不能返回字符串。
- 日期必须使用 YYYY-MM-DD 格式。
- 所有返回给用户看的文字必须使用英文。
- 返回结果必须是可以直接被 JSON.parse() 解析的合法 JSON。

          `
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${mimetype};base64,${base64Image}`
                        }
                    }
                ]
            }
        ]
    });

    const text = response.choices[0]!.message.content!;

    return JSON.parse(text);

}
