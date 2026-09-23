/** Feature settings and its private editor state. */
function createReviewsSettings({ hasTmdbKey }) {
    function loadReviewsSettings(config) {
        document.querySelector('#showReviews').checked = config.ShowReviews;
        document.querySelector('#showUserReviews').checked = !!config.ShowUserReviews;
        document.querySelector('#reviewsExpandedByDefault').checked = config.ReviewsExpandedByDefault;
        document.querySelector('#hideReviewsFromHiddenUsers').checked = config.HideReviewsFromHiddenUsers !== false;
        document.querySelector('#hideReviewsFromDisabledUsers').checked = config.HideReviewsFromDisabledUsers !== false;
    }

    function readReviewsSettings(config) {
        config.ShowReviews = document.querySelector('#showReviews').checked;
        config.ShowUserReviews = document.querySelector('#showUserReviews').checked;
        config.ReviewsExpandedByDefault = document.querySelector('#reviewsExpandedByDefault').checked;
        config.HideReviewsFromHiddenUsers = document.querySelector('#hideReviewsFromHiddenUsers').checked;
        config.HideReviewsFromDisabledUsers = document.querySelector('#hideReviewsFromDisabledUsers').checked;
    }

    function getReviewsIndividualDeps() {
        return [{ id: 'showReviews', checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', icon: 'key' }];
    }

    function getReviewsParentDeps() {
        return [
            { parent: 'showReviews', label: 'Show Reviews', children: ['reviewsExpandedByDefault'] },
            {
                parent: 'showUserReviews',
                label: 'Enable User Reviews',
                children: [
                    'hideReviewsFromHiddenUsers',
                    'hideReviewsFromDisabledUsers',
                    'showUserRatingDash',
                    'showUserRatingOnPosters',
                ],
            },
        ];
    }

    function getDependencies() {
        return { individual: getReviewsIndividualDeps(), parents: getReviewsParentDeps() };
    }
    return { load: loadReviewsSettings, read: readReviewsSettings, getDependencies };
}
