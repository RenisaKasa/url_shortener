package com.urlshortener.url_shortener.config;

import com.urlshortener.url_shortener.service.UrlExpirationService;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
        prefix = "app.urls.expiration",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class UrlExpirationScheduler {

    private final UrlExpirationService expiration;

    public UrlExpirationScheduler(UrlExpirationService expiration) {
        this.expiration = expiration;
    }

    @Scheduled(
            fixedDelayString =
                    "${app.urls.expiration.check-interval:PT1M}",
            initialDelayString =
                    "${app.urls.expiration.initial-delay:PT1M}"
    )
    public void runExpirationCheck() {
        expiration.expireUrls();
    }
}