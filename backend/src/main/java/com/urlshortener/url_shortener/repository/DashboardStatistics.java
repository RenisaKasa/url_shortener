package com.urlshortener.url_shortener.repository;

public interface DashboardStatistics {
    Long getTotalUrls();
    Long getActiveUrls();
    Long getExpiredUrls();
    Long getTotalClicks();
}