package com.urlshortener.url_shortener;

import com.urlshortener.url_shortener.entity.Role;
import com.urlshortener.url_shortener.entity.ShortUrl;
import com.urlshortener.url_shortener.entity.User;
import com.urlshortener.url_shortener.repository.ShortUrlRepository;
import com.urlshortener.url_shortener.repository.UserRepository;
import com.urlshortener.url_shortener.security.AccountPrincipal;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardIntegrationTests {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired ShortUrlRepository urls;

    @BeforeEach
    void resetDatabase() {
        urls.deleteAll();
        users.deleteAll();
    }

    @Test
    void anonymousRequestsAreRejected() throws Exception {
        mvc.perform(get("/api/dashboard/statistics"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anEmptyAccountReturnsZeros() throws Exception {
        var owner = createUser("empty@example.com", Role.USER);

        mvc.perform(get("/api/dashboard/statistics")
                        .with(user(new AccountPrincipal(owner))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalUrls").value(0))
                .andExpect(jsonPath("$.activeUrls").value(0))
                .andExpect(jsonPath("$.expiredUrls").value(0))
                .andExpect(jsonPath("$.totalClicks").value(0));
    }

    @Test
    void statisticsIncludeOnlyTheLoggedInUsersLinks() throws Exception {
        var owner = createUser("owner@example.com", Role.USER);
        var other = createUser("other@example.com", Role.USER);

        Instant future = Instant.now().plusSeconds(3600);
        Instant past = Instant.now().minusSeconds(3600);

        createUrl(owner, "enabled", true, future, 10);
        createUrl(owner, "disabled", false, future, 20);
        createUrl(owner, "expired", true, past, 30);
        createUrl(owner, "disabled-expired", false, past, 40);

        createUrl(other, "someone-elses", true, future, 999);

        mvc.perform(get("/api/dashboard/statistics")
                        .with(user(new AccountPrincipal(owner)))
                        .param("userId", other.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalUrls").value(4))
                .andExpect(jsonPath("$.activeUrls").value(1))
                .andExpect(jsonPath("$.expiredUrls").value(2))
                .andExpect(jsonPath("$.totalClicks").value(100));
    }

    @Test
    void administratorsAlsoReceiveOnlyTheirOwnStatistics() throws Exception {
        var admin = createUser("admin@example.com", Role.ADMIN);
        var owner = createUser("owner@example.com", Role.USER);

        Instant future = Instant.now().plusSeconds(3600);

        createUrl(admin, "admin-link", true, future, 7);
        createUrl(owner, "user-link", true, future, 100);

        mvc.perform(get("/api/dashboard/statistics")
                        .with(user(new AccountPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalUrls").value(1))
                .andExpect(jsonPath("$.activeUrls").value(1))
                .andExpect(jsonPath("$.expiredUrls").value(0))
                .andExpect(jsonPath("$.totalClicks").value(7));
    }

    @Test
    void expirationBoundaryAndLinksWithoutExpirationAreHandled() {
        var owner = createUser("owner@example.com", Role.USER);

        //  expiration boundary
        Instant now = Instant.parse("2030-01-01T12:00:00Z");

        createUrl(owner, "past", true, now.minusSeconds(1), 1);
        createUrl(owner, "exact-boundary", true, now, 2);
        createUrl(owner, "future", true, now.plusSeconds(1), 3);
        createUrl(owner, "no-expiration", true, null, 4);
        createUrl(owner, "disabled-future", false, now.plusSeconds(1), 5);
        createUrl(owner, "disabled-past", false, now.minusSeconds(1), 6);

        var statistics = urls.getDashboardStatistics(
                owner.getId(),
                now
        );

        assertThat(statistics.getTotalUrls()).isEqualTo(6L);
        assertThat(statistics.getActiveUrls()).isEqualTo(2L);
        assertThat(statistics.getExpiredUrls()).isEqualTo(3L);
        assertThat(statistics.getTotalClicks()).isEqualTo(21L); }

    @Test
    void clickTotalsSupportValuesLargerThanAnInteger() throws Exception {
        var owner = createUser("owner@example.com", Role.USER);

        createUrl(
                owner,
                "popular",
                true,
                Instant.now().plusSeconds(3600),
                3_000_000_000L
        );

        mvc.perform(get("/api/dashboard/statistics")
                        .with(user(new AccountPrincipal(owner))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalClicks")
                        .value(3_000_000_000L));
    }

    private User createUser(String email, Role role) {
        var account = new User();
        account.setEmail(email);
        account.setRole(role);
        account.setPasswordHash("unused-in-this-test");

        return users.saveAndFlush(account);
    }

    private void createUrl(
            User owner,
            String code,
            boolean active,
            Instant expiresAt,
            long clicks
    ) {
        var url = new ShortUrl();
        url.setUser(owner);
        url.setOriginalUrl("https://example.com/" + code);
        url.setShortCode(code);
        url.setActive(active);
        url.setExpiresAt(expiresAt);
        url.setClickCount(clicks);

        urls.saveAndFlush(url);
    }
}