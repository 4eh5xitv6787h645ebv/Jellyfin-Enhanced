/** Feature settings and its private editor state. */
function createAppearanceCustomLinks({ lifecycle }) {
    // Custom Plugin Links functionality
    const testCustomPluginLinksBtn = document.getElementById('testCustomPluginLinksBtn');

    const customPluginLinksTextarea = document.getElementById('customPluginLinks');

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        if (testCustomPluginLinksBtn) {
            lifecycle.listen(testCustomPluginLinksBtn, 'click', async () => {
                const linksText = customPluginLinksTextarea.value.trim();
                if (!linksText) {
                    Dashboard.alert({
                        title: 'No Links',
                        message: 'Please add some custom plugin links first.',
                    });
                    return;
                }

                // Parse and validate the links
                const lines = linksText.split('\n');
                const validLinks = [];
                const invalidLines = [];

                lines.forEach((line, index) => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return;

                    const parts = trimmedLine.split('|').map((part) => part.trim());
                    if (parts.length >= 2 && parts[0] && parts[1]) {
                        validLinks.push({ name: parts[0], icon: parts[1] });
                    } else {
                        invalidLines.push(`Line ${index + 1}: "${trimmedLine}"`);
                    }
                });

                if (invalidLines.length > 0) {
                    Dashboard.alert({
                        title: 'Invalid Format',
                        message: `The following lines have invalid format:\n\n${invalidLines.join('\n')}\n\nPlease use the format: Configuration Page Name | icon_name`,
                    });
                    return;
                }

                if (validLinks.length === 0) {
                    Dashboard.alert({
                        title: 'No Valid Links',
                        message: 'No valid plugin links found. Please check the format.',
                    });
                    return;
                }

                // Test the links by temporarily adding them to the sidebar
                // Trigger the plugin icons script to refresh with test data
                if (window.JellyfinEnhanced && window.JellyfinEnhanced.customPlugins) {
                    // Temporarily store test data
                    window.testCustomPluginLinks = validLinks;
                    window.JellyfinEnhanced.customPlugins.refresh();
                }
            });
        }
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
