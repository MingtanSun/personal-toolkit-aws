import dayjs from "dayjs";
import { loadSubscription, type Subscriptions } from "./subscription.js";

export interface UpcomingSubscription extends Subscriptions {
    nextPaymentDate: string;
}

export async function getTheMostExpensiveSubscription(userId: string): Promise<[number, string]> {
    const subscriptions = await loadSubscription(userId);
    let largestAmount = 0;
    let serviceName = '';

    subscriptions.forEach((subscription) => {
        if (subscription.amount !== null && largestAmount < subscription.amount) {
            largestAmount = subscription.amount;
            serviceName = subscription.serviceName ?? '';
        }
    });

    return [largestAmount, serviceName];
}

export async function calculateCostMonthly(userId: string): Promise<number> {
    const subscriptions = await loadSubscription(userId);
    let sumAmount = 0;

    subscriptions.forEach((subscription) => {
        if (subscription.billingCycle === 'monthly' && subscription.amount !== null) {
            sumAmount += subscription.amount;
        }
    });

    return sumAmount;
}

export async function getAllSubscriptions(userId: string): Promise<Subscriptions[]> {
    return loadSubscription(userId);
}

export async function getParticularSubscription(
    userId: string,
    possibleServiceName: string[]
): Promise<Subscriptions[]> {
    const subscriptions = await loadSubscription(userId);
    const normalizedNames = new Set(
        possibleServiceName.map(serviceName => serviceName.trim().toLowerCase())
    );

    return subscriptions.filter(subscription => {
        const serviceName = subscription.serviceName?.trim().toLowerCase();
        return serviceName !== undefined && normalizedNames.has(serviceName);
    });
}

export async function getUpcomingSubscriptions(
    userId: string,
    days: number
): Promise<UpcomingSubscription[]> {
    const subscriptions = await loadSubscription(userId);
    const today = dayjs().startOf("day");
    const result: UpcomingSubscription[] = [];

    subscriptions.forEach(subscription => {
        const firstPaymentDate = dayjs(subscription.firstPaymentDate!).startOf("day");
        let nextPaymentDate;

        if (subscription.billingCycle === "monthly") {
            const monthsSinceFirstPayment = Math.max(
                0,
                (today.year() - firstPaymentDate.year()) * 12
                    + today.month()
                    - firstPaymentDate.month()
            );

            nextPaymentDate = firstPaymentDate.add(monthsSinceFirstPayment, "month");

            if (nextPaymentDate.isBefore(today, "day")) {
                nextPaymentDate = firstPaymentDate.add(monthsSinceFirstPayment + 1, "month");
            }
        } else if (subscription.billingCycle === "yearly") {
            const yearsSinceFirstPayment = Math.max(
                0,
                today.year() - firstPaymentDate.year()
            );

            nextPaymentDate = firstPaymentDate.add(yearsSinceFirstPayment, "year");

            if (nextPaymentDate.isBefore(today, "day")) {
                nextPaymentDate = firstPaymentDate.add(yearsSinceFirstPayment + 1, "year");
            }
        }

        if (!nextPaymentDate) {
            return;
        }

        const daysUntilPayment = nextPaymentDate.diff(today, "day");

        if (daysUntilPayment >= 0 && daysUntilPayment <= days) {
            result.push({
                ...subscription,
                nextPaymentDate: nextPaymentDate.format("YYYY-MM-DD")
            });
        }
    });

    return result;
}
