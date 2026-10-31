package com.urlshortener.url_shortener;

import com.urlshortener.url_shortener.entity.User;
import com.urlshortener.url_shortener.entity.ShortUrl;
import com.urlshortener.url_shortener.repository.UserRepository;
import com.urlshortener.url_shortener.repository.ShortUrlRepository;
import com.urlshortener.url_shortener.service.UrlExpirationService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class UrlExpirationIntegrationTests {

    @Autowired UserRepository users;
    @Autowired ShortUrlRepository urls;
    @Autowired UrlExpirationService expiration;

    private User owner;
    private User other;

    @BeforeEach
    void fixtures() {
        // Execute cleanup immediately, including when this fixture runs inside a test transaction.
        urls.deleteAllInBatch();
        users.deleteAllInBatch();

        owner = createUser("owner@example.com");
        other = createUser("other@example.com");
    }

    @Test
    void expiredLinksAreDisabledWithoutDeletingStatistics() {
        Instant past = Instant.now().minusSeconds(3600);
        Instant future = Instant.now().plusSeconds(3600);

        var expired = createUrl(owner, "expired", true, past);
        var otherExpired = createUrl(other, "other-expired", true, past);
        var valid = createUrl(owner, "valid", true, future);
        var unlimited = createUrl(owner, "unlimited", true, null);
        var disabled = createUrl(owner, "disabled", false, future);

        // Read database values before the update to avoid timestamp-precision differences.
        var before = urls.findById(expired.getId()).orElseThrow();

        assertThat(expiration.expireUrls()).isEqualTo(2);

        var after = urls.findById(expired.getId()).orElseThrow();

        assertThat(after.isActive()).isFalse();
        assertThat(after.getClickCount()).isEqualTo(before.getClickCount());
        assertThat(after.getExpiresAt()).isEqualTo(before.getExpiresAt());
        assertThat(after.getLastAccessedAt())
                .isEqualTo(before.getLastAccessedAt());

        assertThat(urls.findById(otherExpired.getId())
                .orElseThrow().isActive()).isFalse();

        assertThat(urls.findById(valid.getId())
                .orElseThrow().isActive()).isTrue();

        assertThat(urls.findById(unlimited.getId())
                .orElseThrow().isActive()).isTrue();

        assertThat(urls.findById(disabled.getId())
                .orElseThrow().isActive()).isFalse();

        assertThat(urls.count()).isEqualTo(5);

        // Repeating the job should not update already-disabled links.
        assertThat(expiration.expireUrls()).isZero();
    }

    @Test
    @Transactional
    void expirationAtTheExactCutoffIsIncluded() {
        Instant cutoff = Instant.parse("2030-01-01T12:00:00Z");

        var boundary = createUrl(
                owner,
                "boundary",
                true,
                cutoff
        );

        var future = createUrl(
                owner,
                "future",
                true,
                cutoff.plusSeconds(1)
        );

        assertThat(urls.deactivateExpired(cutoff)).isEqualTo(1);

        assertThat(urls.findById(boundary.getId())
                .orElseThrow().isActive()).isFalse();

        assertThat(urls.findById(future.getId())
                .orElseThrow().isActive()).isTrue();
    }

    @Test
    void anEmptyDatabaseRequiresNoUpdates() {
        assertThat(expiration.expireUrls()).isZero();
    }

    private User createUser(String email) {
        var account = new User();
        account.setEmail(email);
        account.setPasswordHash("unused-in-this-test");

        return users.saveAndFlush(account);
    }

    private ShortUrl createUrl(
            User owner,
            String code,
            boolean active,
            Instant expiresAt
    ) {
        var url = new ShortUrl();
        url.setUser(owner);
        url.setOriginalUrl("https://example.com/" + code);
        url.setShortCode(code);
        url.setActive(active);
        url.setExpiresAt(expiresAt);
        url.setClickCount(9L);
        url.setLastAccessedAt(
                Instant.now().minusSeconds(60)
        );

        return urls.saveAndFlush(url);
    }
}
