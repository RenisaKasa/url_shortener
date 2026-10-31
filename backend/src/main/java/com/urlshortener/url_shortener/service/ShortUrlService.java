package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.dto.CreateUrlRequest;
import com.urlshortener.url_shortener.entity.ShortUrl;
import com.urlshortener.url_shortener.repository.ShortUrlRepository;
import com.urlshortener.url_shortener.repository.UserRepository;
import com.urlshortener.url_shortener.security.AccountPrincipal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
public class ShortUrlService {

    private final ShortUrlRepository urls;
    private final UserRepository users;
    private final Duration defaultLifetime;

    public ShortUrlService(
            ShortUrlRepository urls,
            UserRepository users,
            @Value("${app.urls.default-lifetime:P30D}") Duration defaultLifetime
    ) {
        if (defaultLifetime.isZero() || defaultLifetime.isNegative()) {
            throw new IllegalArgumentException(
                    "Default URL lifetime must be positive"
            );
        }

        this.urls = urls;
        this.users = users;
        this.defaultLifetime = defaultLifetime;
    }

    @Transactional
    @PreAuthorize("isAuthenticated()")
    public ShortUrl create(CreateUrlRequest request) {
        String originalUrl = validateUrl(request.originalUrl());

        var principal = (AccountPrincipal) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        String code = request.customAlias() == null
                ? generateCode()
                : request.customAlias();

        if (urls.existsByShortCode(code)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This alias is already taken"
            );
        }

        Instant now = Instant.now();
        Instant expiresAt = request.expiresAt() == null
                ? now.plus(defaultLifetime)
                : request.expiresAt();

        if (!expiresAt.isAfter(now)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Expiration date must be in the future"
            );
        }

        var url = new ShortUrl();
        url.setOriginalUrl(originalUrl);
        url.setShortCode(code);
        url.setUser(users.getReferenceById(principal.getId()));
        url.setExpiresAt(expiresAt);

        // Flush here so database uniqueness conflicts use the existing 409 handler.
        return urls.saveAndFlush(url);
    }

    @Transactional
    public URI resolve(String code) {
        var url = urls.findByShortCode(code)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Short URL not found"
                ));

        Instant now = Instant.now();

        if (!url.isActive()
                || (url.getExpiresAt() != null
                && !url.getExpiresAt().isAfter(now))) {
            throw unavailable();
        }

        // Recheck status/expiration in the update and increment atomically.
        if (urls.recordClick(url.getId(), now) == 0) {
            throw unavailable();
        }

        return URI.create(url.getOriginalUrl());
    }

    private String generateCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = UUID.randomUUID()
                    .toString()
                    .replace("-", "")
                    .substring(0, 12);

            if (!urls.existsByShortCode(code)) {
                return code;
            }
        }

        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Could not generate a short code. Please try again"
        );
    }

    private String validateUrl(String value) {
        String normalized = value.trim();

        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme();

            boolean supportedScheme = "http".equalsIgnoreCase(scheme)
                    || "https".equalsIgnoreCase(scheme);

            if (supportedScheme
                    && uri.getHost() != null
                    && uri.getUserInfo() == null) {
                return normalized;
            }
        } catch (IllegalArgumentException ignored) {
            // Return the same validation error for malformed URLs.
        }

        throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Provide a valid HTTP or HTTPS URL without embedded credentials"
        );
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(
                HttpStatus.GONE,
                "This short URL is inactive or expired"
        );
    }
}