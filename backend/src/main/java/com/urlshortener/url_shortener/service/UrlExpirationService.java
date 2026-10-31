package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.repository.ShortUrlRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class UrlExpirationService {

    private static final Logger log =
            LoggerFactory.getLogger(UrlExpirationService.class);

    private final ShortUrlRepository urls;

    public UrlExpirationService(ShortUrlRepository urls) {
        this.urls = urls;
    }

    @Transactional
    public int expireUrls() {
        int updated = urls.deactivateExpired(Instant.now());

        if (updated > 0) {
            log.info("Automatically deactivated {} expired URL(s)", updated);
        }

        return updated;
    }
}