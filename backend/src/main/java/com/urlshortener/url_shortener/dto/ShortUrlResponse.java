package com.urlshortener.url_shortener.dto;

import com.urlshortener.url_shortener.entity.ShortUrl;
import java.time.Instant;

public record ShortUrlResponse(Long id, String originalUrl, String shortCode, Long userId,
                               boolean active, Instant expiresAt, Long clickCount, Instant lastAccessedAt) {
    public static ShortUrlResponse from(ShortUrl url) {
        return new ShortUrlResponse(url.getId(), url.getOriginalUrl(), url.getShortCode(),
                url.getUser().getId(), url.isActive(), url.getExpiresAt(), url.getClickCount(), url.getLastAccessedAt());
    }
}
