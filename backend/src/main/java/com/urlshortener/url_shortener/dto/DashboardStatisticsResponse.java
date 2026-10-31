package com.urlshortener.url_shortener.dto;

public record DashboardStatisticsResponse(
        Long totalUrls,
        Long activeUrls,
        Long expiredUrls,
        Long totalClicks
) {
}
