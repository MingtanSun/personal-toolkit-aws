function SubscriptionInfoRender({ formData, warning, hasResult, updateField }) {
    const {
        serviceName,
        planName,
        billingCycle,
        amount,
        currency,
        firstPaymentDate,
        websiteUrl,
        notes
    } = formData;

    return (
        <div className="subscription-form-grid">
            <label className="subscription-field">
                <span className="subscription-field-label">
                    Service name
                    {hasResult && !serviceName && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={serviceName} onChange={(event) => {
                    updateField('serviceName', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Plan name
                    {hasResult && !planName && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={planName} onChange={(event) => {
                    updateField('planName', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Billing cycle
                    {hasResult && !billingCycle && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={billingCycle} onChange={(event) => {
                    updateField('billingCycle', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Amount
                    {hasResult && amount === '' && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={amount} onChange={(event) => {
                    updateField('amount', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    Currency
                    {hasResult && !currency && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={currency} onChange={(event) => {
                    updateField('currency', event.target.value);
                }} />
            </label>

            <label className="subscription-field">
                <span className="subscription-field-label">
                    First payment date
                    {hasResult && !firstPaymentDate && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="date" value={firstPaymentDate} onChange={(event) => {
                    updateField('firstPaymentDate', event.target.value);
                }} />
            </label>

            <label className="subscription-field subscription-field-wide">
                <span className="subscription-field-label">
                    Website URL
                    {hasResult && !websiteUrl && <span className="empty-reminder">! Required</span>}
                </span>
                <input className="subscription-input" type="text" value={websiteUrl} onChange={(event) => {
                    updateField('websiteUrl', event.target.value);
                }} />
            </label>

            <label className="subscription-field subscription-field-wide">
                <span className="subscription-field-label">Notes</span>
                <input className="subscription-input" type="text" value={notes} onChange={(event) => {
                    updateField('notes', event.target.value);
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
