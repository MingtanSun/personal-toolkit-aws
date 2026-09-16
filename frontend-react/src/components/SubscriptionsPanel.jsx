import { useEffect, useState } from "react";
import { loadSubscription } from "./Subscriptions/utils/SubsUtils.js";
import SubscriptionUploader from "./Subscriptions/SubscriptionUploader.jsx";
import { SubmitForm } from "./Subscriptions/SubmitForm.jsx";
import { DisplaySubscription } from "./Subscriptions/DisplaySubscription.jsx";

function SubscriptionsPanel({ auth, setAuth, onAuthExpired }) {
    // 用户选择的截图文件
    const [file, setFile] = useState(null);
    // 截图在浏览器中的本地预览地址
    const [previewUrl, setPreviewUrl] = useState("");
    // 后端返回的截图识别结果
    const [result, setResult] = useState(null);
    // 从后端获取的订阅列表
    const [subscriptions, setSubscriptions] = useState(null);
    //管理‘Save the Subscription'按钮是否出现
    const [showUpSavetheSubscription, setShowUpSavetheSubscription] = useState(false);

    useEffect(() => {
        if (!auth) {
            return;
        }

        async function fetchSubscriptions() {
            const data = await loadSubscription(auth, setAuth, onAuthExpired);
            setSubscriptions(data);
            console.log(data);
        }

        fetchSubscriptions();
    }, []);

    return (
        <div className="subscription-workspace">
            <section className="subscription-card card" aria-labelledby="addSubscriptionTitle">
                <div className="subscription-section-heading">
                    <div>
                        <p className="card-eyebrow">Subscription tracker</p>
                        <h2 className="subscription-section-title" id="addSubscriptionTitle">
                            Add a subscription
                        </h2>
                        <p className="card-sub">Upload a screenshot and review the information found by AI.</p>
                    </div>
                </div>

                <div className="subscription-upload-area">
                    <div className="subscription-upload-heading">
                        <h3>Upload screenshot</h3>
                        <p>PNG, JPEG, or WebP</p>
                    </div>
                    <div>
                {file && <p>Filename: {file.name}</p>}
                {previewUrl && (
                    <img
                        src={previewUrl}
                        alt="Subscription screenshot preview"
                        style={{
                            width: "100%",
                            maxWidth: "500px",
                            maxHeight: "400px",
                            objectFit: "contain"
                        }}
                    />
                )}
                    </div>

                <SubscriptionUploader
                    setFile={setFile}
                    file={file}
                    setPreviewUrl={setPreviewUrl}
                    auth={auth}
                    setAuth={setAuth}
                    onAuthExpired={onAuthExpired}
                    result={result}
                    setResult={setResult}
                    setShowUpSavetheSubscription={setShowUpSavetheSubscription}
                />
                </div>

                <div className="subscription-result-area">
                    <div className="subscription-section-heading">
                        <div>
                            <h3>Recognized information</h3>
                            <p className="card-sub">Check the fields before saving your subscription.</p>
                        </div>
                    </div>
                <SubmitForm
                    result={result}
                    setResult={setResult}
                    setSubscriptions={setSubscriptions}
                    auth={auth}
                    setAuth={setAuth}
                    onAuthExpired={onAuthExpired}
                    showUpSavetheSubscription={showUpSavetheSubscription}
                    setShowUpSavetheSubscription={setShowUpSavetheSubscription}
                />
                </div>
            </section>

            <section className="subscription-card card" aria-labelledby="mySubscriptionsTitle">
                <div className="subscription-section-heading">
                    <div>
                        <p className="card-eyebrow">Your recurring costs</p>
                        <h2 className="subscription-section-title" id="mySubscriptionsTitle">
                            My subscriptions
                        </h2>
                    </div>
                </div>
                <DisplaySubscription
                    subscriptions={subscriptions}
                    setSubscriptions={setSubscriptions}
                    auth={auth}
                    setAuth={setAuth}
                    onAuthExpired={onAuthExpired}
                />
            </section>
        </div>
    );
}

export default SubscriptionsPanel;
