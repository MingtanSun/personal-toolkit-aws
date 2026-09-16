import { useState } from "react";
import { apiFetch, readApiErrorMessage } from "../../api.js";

function SubscriptionUploader({ setFile, file, setPreviewUrl, auth, setAuth, onAuthExpired, result, setResult, setShowUpSavetheSubscription }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeMessage, setAnalyzeMessage] = useState('');
    const [analyzeError, setAnalyzeError] = useState(false);

    function handleFileChange(event) {
        const selectFile = event.target.files[0];

        if (selectFile) {
            setFile(selectFile);
            const imageUrl = URL.createObjectURL(selectFile);
            setPreviewUrl(imageUrl);
            setAnalyzeMessage('');
            setAnalyzeError(false);
        } else {
            setFile(null);
            setPreviewUrl('');
            setAnalyzeMessage('');
        }
    }

    async function uploadPictureToBackend() {
        if (!file) {
            setAnalyzeMessage('Choose a screenshot first.');
            setAnalyzeError(true);
            return;
        }

        setIsAnalyzing(true);
        setAnalyzeMessage('AI is reading your subscription details...');
        setAnalyzeError(false);

        const formData = new FormData();
        formData.append("screenshot", file);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 45_000);
        try {
            const response = await apiFetch(
                "/subscription/analyze",
                {
                    method: "POST",
                    body: formData,
                    signal: controller.signal
                },
                auth,
                setAuth,
                onAuthExpired
            );

            if (response.status === 504) {
                setAnalyzeMessage(await readApiErrorMessage(
                    response,
                    'AI analysis timed out. Please try again.'
                ));
                setAnalyzeError(true);
                return;
            }

            if (!response.ok) {
                throw new Error('Could not analyze this screenshot.');
            }

            const data = await response.json();
            console.log(data);
            setResult(data);
            setShowUpSavetheSubscription(true);
            setAnalyzeMessage('Screenshot analyzed successfully. Review the information below.');
        } catch (error) {
            if (error.name === "AbortError") {
                setAnalyzeMessage(
                    "Image analysis timed out. Please try again."
                );
            }
            else {
                setAnalyzeMessage('Could not analyze this screenshot. Please try again.');
            }
            setAnalyzeError(true);
        } finally {
            setIsAnalyzing(false);
            clearTimeout(timeoutId);
        }
    }

    return (
        <>
            <input
                className="subscription-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={isAnalyzing}
                onChange={handleFileChange}
            />

            <button className="btn-primary subscription-upload-button" type="button" disabled={!file || isAnalyzing} onClick={uploadPictureToBackend}>
                {isAnalyzing ? 'Analyzing...' : 'Analyze screenshot'}
            </button>
            {analyzeMessage && (
                <p className={`subscription-status${analyzeError ? ' subscription-status-error' : ''}`} role={analyzeError ? 'alert' : 'status'}>
                    {analyzeMessage}
                </p>
            )}
        </>
    );
}

export default SubscriptionUploader;
