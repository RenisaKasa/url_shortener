package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.dto.DashboardStatisticsResponse;
import com.urlshortener.url_shortener.repository.ShortUrlRepository;
import com.urlshortener.url_shortener.security.AccountPrincipal;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@PreAuthorize("isAuthenticated()")
@Transactional(readOnly = true)
public class DashboardService {

    private final ShortUrlRepository urls;

    public DashboardService(ShortUrlRepository urls) {
        this.urls = urls;
    }

    public DashboardStatisticsResponse getStatistics() {
        var principal = (AccountPrincipal) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        var statistics = urls.getDashboardStatistics(
                principal.getId(),
                Instant.now()
        );

        return new DashboardStatisticsResponse(
                statistics.getTotalUrls(),
                statistics.getActiveUrls(),
                statistics.getExpiredUrls(),
                statistics.getTotalClicks()
        );
    }
}