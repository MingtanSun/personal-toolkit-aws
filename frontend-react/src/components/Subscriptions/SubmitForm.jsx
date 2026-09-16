import { useEffect, useState } from "react";
import SubscriptionInfoRender from "./SubscriptionInfoRender.jsx";
import SubscriptionConfirm from "./SubscriptionConfirm.jsx";

const emptyForm = {
    serviceName: '',
    planName: '',
    billingCycle: '',
    amount: '',
    currency: '',
    firstPaymentDate: '',
    websiteUrl: '',
    notes: ''
};

export function SubmitForm({
    result,
    setResult,
    auth,
    setAuth,
    onAuthExpired,
    setSubscriptions,
    showUpSavetheSubscription,
    setShowUpSavetheSubscription
}) {
    const [formData, setFormData] = useState(emptyForm);
    const [warning, setWarning] = useState('');

    useEffect(() => {
        if (result) {
            setFormData({
                serviceName: result.serviceName || '',
                planName: result.planName || '',
                billingCycle: result.billingCycle || '',
                amount: result.amount ?? '',
                currency: result.currency || '',
                firstPaymentDate: result.firstPaymentDate || '',
                websiteUrl: result.websiteUrl || '',
                notes: result.notes || ''
            });
            setWarning(result.similarSubscriptionWarning || '');
        }
    }, [result]);

    function updateField(field, value) {
        setFormData(current => ({
            ...current,
            [field]: value
        }));
    }

    function clearForm() {
        setFormData(emptyForm);
        setWarning('');
        setResult(null);
    }

    return (
        <>
            <SubscriptionInfoRender
                formData={formData}
                warning={warning}
                hasResult={Boolean(result)}
                updateField={updateField}
            />
            <div className="subscription-confirm-area">
                <SubscriptionConfirm
                    result={formData}
                    setSubscriptions={setSubscriptions}
                    auth={auth}
                    setAuth={setAuth}
                    onAuthExpired={onAuthExpired}
                    showUpSavetheSubscription={showUpSavetheSubscription}
                    setShowUpSavetheSubscription={setShowUpSavetheSubscription}
                    onSaved={clearForm}
                />
            </div>
        </>
    );
}
