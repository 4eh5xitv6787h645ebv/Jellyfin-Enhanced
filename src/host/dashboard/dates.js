/** Dashboard dates boundary. */
function createDashboardDates() {
    // Shared date formatting for the whole config page, explicit instead
    // of toLocaleString()/toLocaleDateString() so display doesn't vary by
    // the admin's browser locale. Function declarations hoist through this
    // file's single top-level IIFE, so these are callable from anywhere in
    // it regardless of where they're defined relative to the call site.
    var JE_DATE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /** Formats a Date as "DD-MMM-YYYY" (e.g. "28-Aug-2026"). */
    function formatDateDMY(d) {
        var day = String(d.getDate()).padStart(2, '0');
        var month = JE_DATE_MONTHS[d.getMonth()];
        return day + '-' + month + '-' + d.getFullYear();
    }

    /** Formats a Date as "DD-MMM-YYYY, HH:MM AM/PM" (e.g. "28-Aug-2026, 12:02 AM"). */
    function formatDateTimeDMY(d) {
        var hours24 = d.getHours();
        var ampm = hours24 >= 12 ? 'PM' : 'AM';
        var hours12 = hours24 % 12 || 12;
        var minutes = String(d.getMinutes()).padStart(2, '0');
        return formatDateDMY(d) + ', ' + hours12 + ':' + minutes + ' ' + ampm;
    }

    return { formatDateDMY, formatDateTimeDMY };
}
