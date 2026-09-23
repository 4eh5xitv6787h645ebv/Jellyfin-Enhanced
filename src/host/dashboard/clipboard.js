/** Dashboard clipboard boundary. */
function createDashboardClipboard({ lifecycle }) {
    // Fallback copy method
    function fallbackCopy(text, btn, btnText, isCurrent) {
        if (!isCurrent()) return;
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            btnText.textContent = 'Copied!';
            btn.style.color = '#4CAF50';
            lifecycle.setTimeout(function () {
                if (!isCurrent()) return;
                btnText.textContent = 'Copy';
                btn.style.color = '';
            }, 2000);
        } catch (err) {
            console.error('Fallback copy failed: ', err);
            alert('Failed to copy to clipboard');
        }
        document.body.removeChild(textarea);
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Copy button handler for HTML code snippets
        document.querySelectorAll('.je-copy-html-btn').forEach(function (btn) {
            let copyGeneration = 0;
            lifecycle.listen(btn, 'click', function (e) {
                if (lifecycle.disposed) return;
                const generation = ++copyGeneration;
                const isCurrent = () => !lifecycle.disposed && generation === copyGeneration;
                e.preventDefault();
                e.stopPropagation();

                const htmlCode = this.getAttribute('data-copy-text');
                const btnText = this.querySelector('.copy-btn-text');

                // Try clipboard API first
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard
                        .writeText(htmlCode)
                        .then(function () {
                            if (!isCurrent()) return;
                            btnText.textContent = 'Copied!';
                            btn.style.color = '#4CAF50';
                            lifecycle.setTimeout(function () {
                                if (!isCurrent()) return;
                                btnText.textContent = 'Copy';
                                btn.style.color = '';
                            }, 2000);
                        })
                        .catch(function (err) {
                            if (!isCurrent()) return;
                            console.error('Clipboard API failed: ', err);
                            fallbackCopy(htmlCode, btn, btnText, isCurrent);
                        });
                } else {
                    // Fallback for older browsers
                    fallbackCopy(htmlCode, btn, btnText, isCurrent);
                }
            });
        });
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
