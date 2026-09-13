import { apiFetch } from "../../api.js";
import { loadSubscription } from "./utils/SubsUtils.js";

function SubscriptionConfirm({ result, auth, setAuth, onAuthExpired, setSubscriptions,showUpSavetheSubscription, setShowUpSavetheSubscription }) {
    async function submitInfoToBackend() {
        if (!result) {
            return;
        }

        const requiredFields = [
            "serviceName",
            "planName",
            "billingCycle",
            "amount",
            "currency",
            "firstPaymentDate",
            "websiteUrl"
        ];

        const hasEmptyField = requiredFields.some((field) => {
            return result[field] === null || result[field] === undefined || result[field] === "";
        });

        if (hasEmptyField) {
            window.alert("Please fill in all subscription information before saving.");
            return;
        }

        try {
            const response = await apiFetch(
                "/subscription/submit",
                {
                    method: "POST",
                    body: JSON.stringify({ ...result, amount: Number(result.amount) }),
                    headers: {
                        "Content-Type": "application/json"
                    }
                },
                auth,
                setAuth,
                onAuthExpired
            );

            if (!response.ok) {
                return;
            }

            await response.json();
        } catch (error) {
            console.log(error.message);
        }
        setShowUpSavetheSubscription(false);
        const subsResult = await loadSubscription(auth, setAuth, onAuthExpired);
        setSubscriptions(subsResult);
    }

    return <button className="btn-primary subscription-save-button" disabled={!showUpSavetheSubscription} onClick={submitInfoToBackend}>Save this Subscription</button>;
}

export default SubscriptionConfirm;
