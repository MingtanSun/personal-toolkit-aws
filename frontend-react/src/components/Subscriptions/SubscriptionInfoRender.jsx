import { useEffect, useState } from "react";

function SubscriptionInfoRender({ result, setResult }) {
    // 服务名称输入框的值
    const [serviceName, setServiceName] = useState('');
    // 套餐名称输入框的值
    const [planName, setPlanName] = useState('');
    // 付款周期输入框的值
    const [billingCycle, setBillingCycle] = useState('');
    // 付款额度输入框的值
    const [amount, setAmount] = useState('');
    // 货币种类输入框的值
    const [currency, setCurrency] = useState('');
    // 第一次付款日期输入框的值
    const [firstPaymentDate, setFirstPaymentDate] = useState('');
    // 服务网址输入框的值
    const [websiteUrl, setWebsiteUrl] = useState('');
    // 额外说明输入框的值
    const [notes, setNotes] = useState('');
    //重复警告
    const [warning, setWarning] = useState('');

    useEffect(() => {
        if (result) {
            setServiceName(result.serviceName || '');
            setPlanName(result.planName || '');
            setBillingCycle(result.billingCycle || '');
            setAmount(result.amount ?? '');
            setCurrency(result.currency || '');
            setFirstPaymentDate(result.firstPaymentDate || '');
            setWebsiteUrl(result.websiteUrl || '');
            setNotes(result.notes || '');
            setWarning(result.similarSubscriptionWarning || '');
        }
    }, [result]);

    function updateResult(field, value) {
        setResult({
            ...result,
            [field]: value
        });
    }

    return (
        <div className="subscription-form-grid">
            <label className="subscription-field">
                <span className="subscription-field-label">
                    Service name
                    {result && !serviceName && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={serviceName} onChange={(event) => {
                    setServiceName(event.target.value);
                    updateResult('serviceName', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Plan name
                    {result && !planName && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={planName} onChange={(event) => {
                    setPlanName(event.target.value);
                    updateResult('planName', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Billing cycle
                    {result && !billingCycle && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={billingCycle} onChange={(event) => {
                    setBillingCycle(event.target.value);
                    updateResult('billingCycle', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Amount
                    {result && amount === '' && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={amount} onChange={(event) => {
                    setAmount(event.target.value);
                    updateResult('amount', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Currency
                    {result && !currency && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={currency} onChange={(event) => {
                    setCurrency(event.target.value);
                    updateResult('currency', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    First payment date
                    {result && !firstPaymentDate && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="date" value={firstPaymentDate} onChange={(event) => {
                    setFirstPaymentDate(event.target.value);
                    updateResult('firstPaymentDate', event.target.value);
                }} />
            </label>

            <label className="subscription-field subscription-field-wide">
                <span className="subscription-field-label">
                    Website URL
                    {result && !websiteUrl && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={websiteUrl} onChange={(event) => {
                    setWebsiteUrl(event.target.value);
                    updateResult('websiteUrl', event.target.value);
                }} />
            </label>

            <label className="subscription-field subscription-field-wide">
                <span className="subscription-field-label">Notes</span>
                <input className="subscription-input" type="text" value={notes} onChange={(event) => {
                    setNotes(event.target.value);
                    updateResult('notes', event.target.value);
                }} />
            </label>
            {warning && (
                <p className="subscription-similar-warning" role="status">
                    <span className="subscription-similar-warning-icon" aria-hidden="true">!</span>
                    <span>{warning}</span>
                </p>
            )}
        </div>
    );
}

export default SubscriptionInfoRender;
