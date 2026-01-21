// 11-mobile-news.js - Mobile News Feed Module
// Follows same pattern as dashboard

(function() {
    // Cache for news data
    let newsCache = null;
    let lastFetchTime = 0;
    const CACHE_DURATION = 300000; // 5 minutes

    // Extend MobileApp prototype
    const proto = window.MobileApp.prototype;

    proto.setupNewsListeners = function() {
        document.getElementById('newsBtn')?.addEventListener('click', () => {
            this.openMobileNews();
        });

        document.getElementById('closeNewsBtn')?.addEventListener('click', () => {
            this.closeMobileNews();
        });
    };

    proto.openMobileNews = function() {
        const newsPanel = document.getElementById('mobileNews');
        if (newsPanel) newsPanel.style.display = 'flex';

        // Close dropdown
        document.getElementById('headerUserMenu')?.classList.remove('open');
        document.getElementById('headerDropdownMenu')?.classList.remove('show');
        document.getElementById('headerDropdownBackdrop')?.classList.remove('show');

        this.loadMobileNews();
    };

    proto.closeMobileNews = function() {
        const newsPanel = document.getElementById('mobileNews');
        if (newsPanel) newsPanel.style.display = 'none';
    };

    proto.loadMobileNews = async function() {
        const container = document.getElementById('mobileNewsContainer');
        if (!container) return;

        // Show cached data immediately if available
        if (newsCache) {
            this.renderMobileNews(newsCache);
            // If cache is still fresh, don't refetch
            if (Date.now() - lastFetchTime < CACHE_DURATION) return;
        } else {
            // Show loading state
            container.innerHTML = `
                <div class="news-loading">
                    <div class="loading-spinner"></div>
                    <p>Loading news...</p>
                </div>
            `;
        }

        try {
            const result = await this.apiCall('/api/news');
            if (result.success && result.data?.length > 0) {
                newsCache = result.data;
                lastFetchTime = Date.now();
                this.renderMobileNews(newsCache);
            } else if (!newsCache) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fas fa-newspaper"></i></div>
                        <h3>No News Available</h3>
                        <p>Check back later for updates</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading news:', error);
            if (!newsCache) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fas fa-wifi-slash"></i></div>
                        <h3>Connection Error</h3>
                        <p>Unable to load news feed</p>
                    </div>
                `;
            }
        }
    };

    proto.renderMobileNews = function(data) {
        const container = document.getElementById('mobileNewsContainer');
        if (!container) return;

        const html = data.map(item => {
            // Badge class mapping
            let badgeClass = 'source-industry';
            const src = (item.source || '').toLowerCase();
            if (src.includes('debanked')) badgeClass = 'source-debanked';
            else if (src.includes('legal') || src.includes('ftc')) badgeClass = 'source-legal';
            else if (src.includes('lendsaas')) badgeClass = 'source-lendsaas';

            const iconClass = item.icon || 'fa-bolt';
            const timeAgo = item.pubDate ? this.utils.formatDate(item.pubDate, 'ago') : '';

            return `
                <div class="mobile-news-card" onclick="window.open('${item.link}', '_blank')">
                    <div class="news-card-header">
                        <span class="news-source-badge ${badgeClass}">
                            <i class="fas ${iconClass}"></i> ${item.source}
                        </span>
                        ${timeAgo ? `<span class="news-time">${timeAgo}</span>` : ''}
                    </div>
                    <h4 class="news-title">${this.utils.escapeHtml(item.title)}</h4>
                    ${item.description ? `<p class="news-snippet">${this.utils.escapeHtml(item.description).slice(0, 120)}...</p>` : ''}
                    <div class="news-card-footer">
                        <span class="read-more">Read more <i class="fas fa-external-link-alt"></i></span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    };

    // Preload news in background
    proto.preloadNews = async function() {
        if (!newsCache) {
            try {
                const result = await this.apiCall('/api/news');
                if (result.success && result.data?.length > 0) {
                    newsCache = result.data;
                    lastFetchTime = Date.now();
                }
            } catch (e) {
                // Silent fail for preload
            }
        }
    };
})();
