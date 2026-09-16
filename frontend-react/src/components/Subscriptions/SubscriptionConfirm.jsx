import { apiFetch } from "../../api.js";
import { loadSubscription } from "./utils/SubsUtils.js";

function SubscriptionConfirm({ result, auth, setAuth, onAuthExpired, setSubscriptions, setShowUpSavetheSubscription, onSaved }) {
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
            setShowUpSavetheSubscription(false);
            onSaved();
            const subsResult = await loadSubscription(auth, setAuth, onAuthExpired);
            setSubscriptions(subsResult);
        } catch (error) {
            console.log(error.message);
        }
    }

    return (<button className="btn-primary subscription-save-button"   onClick={submitInfoToBackend}>Save this Subscription</button>);
}

export default SubscriptionConfirm;
