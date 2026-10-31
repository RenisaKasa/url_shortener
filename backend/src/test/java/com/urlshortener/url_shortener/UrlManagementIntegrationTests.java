package com.urlshortener.url_shortener;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.urlshortener.url_shortener.entity.*;
import com.urlshortener.url_shortener.repository.*;
import com.urlshortener.url_shortener.security.AccountPrincipal;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UrlManagementIntegrationTests {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired ShortUrlRepository urls;
    @Autowired PasswordEncoder passwords;

    private User owner;
    private User other;
    private User admin;

    private ShortUrl active;
    private ShortUrl inactive;
    private ShortUrl expired;
    private ShortUrl foreign;

    @BeforeEach
    void fixtures() {
        urls.deleteAll();
        users.deleteAll();

        String hash = passwords.encode("test-password");

        owner = account("owner@example.com", Role.USER, hash);
        other = account("other@example.com", Role.USER, hash);
        admin = account("admin@example.com", Role.ADMIN, hash);

        active = url(owner, "alpha", true,
                Instant.now().plusSeconds(3600), 10);

        inactive = url(owner, "beta", false,
                Instant.now().plusSeconds(3600), 3);

        expired = url(owner, "old", true,
                Instant.now().minusSeconds(3600), 5);

        foreign = url(other, "foreign", true,
                Instant.now().plusSeconds(3600), 99);
    }

    @Test
    void listIsOwnerScopedPaginatedAndSorted() throws Exception {
        mvc.perform(get("/api/urls")
                        .with(as(owner))
                        .param("page", "0")
                        .param("size", "1")
                        .param("sort", "clickCount,desc")
                        .param("userId", other.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].shortCode").value("alpha"));

        mvc.perform(get("/api/urls")
                        .with(as(owner))
                        .param("page", "1")
                        .param("size", "1")
                        .param("sort", "clickCount,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].shortCode").value("old"));

        mvc.perform(get("/api/urls")
                        .with(as(owner))
                        .param("page", "9")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());
    }

    @Test
    void listSupportsSearchAndStatusFilters() throws Exception {
        for (String[] example : new String[][]{
                {"ACTIVE", "alpha"},
                {"INACTIVE", "beta"},
                {"EXPIRED", "old"}
        }) {
            mvc.perform(get("/api/urls")
                            .with(as(owner))
                            .param("status", example[0]))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].shortCode")
                            .value(example[1]));
        }

        mvc.perform(get("/api/urls")
                        .with(as(owner))
                        .param("search", " ALPHA ")
                        .param("status", "ACTIVE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        mvc.perform(get("/api/urls")
                        .with(as(owner))
                        .param("search", "FOREIGN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());

        for (String literal : new String[]{"%", "_", "!"}) {
            mvc.perform(get("/api/urls")
                            .with(as(owner))
                            .param("search", literal))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content").isEmpty());
        }
    }

    @Test
    void detailReturnsUsageStatistics() throws Exception {
        mvc.perform(get("/api/urls/{id}", active.getId())
                        .with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId()))
                .andExpect(jsonPath("$.clickCount").value(10))
                .andExpect(jsonPath("$.lastAccessedAt").isString())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.user").doesNotExist());
    }

    @Test
    void foreignAndMissingUrlsReturn404() throws Exception {
        for (Long id : new Long[]{foreign.getId(), 999999L}) {
            mvc.perform(get("/api/urls/{id}", id)
                            .with(as(owner)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value("URL not found"));

            mvc.perform(patch("/api/urls/{id}", id)
                            .with(as(owner))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"active\":false}"))
                    .andExpect(status().isNotFound());

            mvc.perform(delete("/api/urls/{id}", id)
                            .with(as(owner))
                            .with(csrf()))
                    .andExpect(status().isNotFound());
        }

        assertThat(urls.count()).isEqualTo(4);
        assertThat(urls.findById(foreign.getId())
                .orElseThrow().isActive()).isTrue();

        // Admins use the admin list, not an ownership bypass here.
        mvc.perform(get("/api/urls/{id}", active.getId())
                        .with(as(admin)))
                .andExpect(status().isNotFound());
    }

    @Test
    void updatePreservesStatisticsAndOwnership() throws Exception {
        Instant future = Instant.now().plusSeconds(7200);

        mvc.perform(patch("/api/urls/{id}", active.getId())
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "active", false,
                                "expiresAt", future.toString(),
                                "clickCount", 999,
                                "userId", other.getId()
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.clickCount").value(10))
                .andExpect(jsonPath("$.userId").value(owner.getId()));

        mvc.perform(get("/r/alpha"))
                .andExpect(status().isGone());

        mvc.perform(patch("/api/urls/{id}", active.getId())
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));

        mvc.perform(get("/r/alpha"))
                .andExpect(status().isFound());

        assertThat(urls.findById(active.getId())
                .orElseThrow().getClickCount()).isEqualTo(11);
    }

    @Test
    void expirationOnlyUpdatePreservesActivation() throws Exception {
        mvc.perform(patch("/api/urls/{id}", inactive.getId())
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "expiresAt",
                                Instant.now().plusSeconds(7200).toString()
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void patchValidatesBodyAndExpiredReactivation() throws Exception {
        for (String body : new String[]{
                "{}",
                "{\"active\":null}",
                "{\"expiresAt\":null}",
                "{\"expiresAt\":\"invalid-date\"}",
                "{\"expiresAt\":\"2000-01-01T00:00:00Z\"}"
        }) {
            mvc.perform(patch("/api/urls/{id}", active.getId())
                            .with(as(owner))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400));
        }

        mvc.perform(patch("/api/urls/{id}", expired.getId())
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":true}"))
                .andExpect(status().isBadRequest());

        mvc.perform(patch("/api/urls/{id}", expired.getId())
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "active", true,
                                "expiresAt",
                                Instant.now().plusSeconds(7200).toString()
                        ))))
                .andExpect(status().isOk());

        mvc.perform(get("/r/old"))
                .andExpect(status().isFound());
    }

    @Test
    void deleteRemovesTheOwnedUrlAndItsRedirect() throws Exception {
        mvc.perform(delete("/api/urls/{id}", active.getId())
                        .with(as(owner))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(urls.existsById(active.getId())).isFalse();

        mvc.perform(get("/r/alpha"))
                .andExpect(status().isNotFound());
    }

    @Test
    void authenticationAndCsrfAreRequired() throws Exception {
        mvc.perform(get("/api/urls"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/urls/{id}", active.getId()))
                .andExpect(status().isUnauthorized());

        mvc.perform(patch("/api/urls/{id}", active.getId())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":false}"))
                .andExpect(status().isUnauthorized());

        mvc.perform(delete("/api/urls/{id}", active.getId())
                        .with(csrf()))
                .andExpect(status().isUnauthorized());

        mvc.perform(patch("/api/urls/{id}", active.getId())
                        .with(as(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":false}"))
                .andExpect(status().isForbidden());

        mvc.perform(delete("/api/urls/{id}", active.getId())
                        .with(as(owner)))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminListsSupportFilteringPaginationAndSorting() throws Exception {
        other.setActive(false);
        users.saveAndFlush(other);

        mvc.perform(get("/api/admin/users")
                        .with(as(admin))
                        .param("search", "OWNER")
                        .param("active", "true")
                        .param("role", "USER")
                        .param("size", "1")
                        .param("sort", "email,asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].email")
                        .value(owner.getEmail()))
                .andExpect(jsonPath("$.content[0].passwordHash")
                        .doesNotExist());

        mvc.perform(get("/api/admin/users")
                        .with(as(admin))
                        .param("active", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].email")
                        .value(other.getEmail()));

        mvc.perform(get("/api/admin/urls")
                        .with(as(admin))
                        .param("userId", owner.getId().toString())
                        .param("status", "ACTIVE")
                        .param("search", "ALPHA")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        mvc.perform(get("/api/admin/urls")
                        .with(as(admin))
                        .param("size", "1")
                        .param("sort", "clickCount,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.content[0].shortCode")
                        .value("foreign"));

        mvc.perform(get("/api/admin/users").with(as(owner)))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/admin/urls").with(as(owner)))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidQueryParametersReturnJsonErrors() throws Exception {
        for (String[] bad : new String[][]{
                {"page", "-1"},
                {"page", "abc"},
                {"size", "0"},
                {"size", "101"},
                {"page", "2147483647"},
                {"sort", "user.passwordHash,asc"},
                {"sort", "createdAt,wrong"},
                {"sort", "id,asc,extra"},
                {"status", "UNKNOWN"},
                {"search", "x".repeat(201)}
        }) {
            mvc.perform(get("/api/urls")
                            .with(as(owner))
                            .param(bad[0], bad[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400));
        }

        for (String[] bad : new String[][]{
                {"sort", "passwordHash,asc"},
                {"role", "UNKNOWN"},
                {"active", "invalid"}
        }) {
            mvc.perform(get("/api/admin/users")
                            .with(as(admin))
                            .param(bad[0], bad[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400));
        }

        mvc.perform(get("/api/admin/urls")
                        .with(as(admin))
                        .param("userId", "-1"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/urls/not-a-number")
                        .with(as(owner)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void creationRedirectAndStatisticsStillWorkTogether() throws Exception {
        var result = mvc.perform(post("/api/urls")
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "originalUrl": "https://example.org/page"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();

        var body = json.readTree(
                result.getResponse().getContentAsString()
        );

        String code = body.get("shortCode").asText();
        Long id = body.get("id").asLong();

        assertThat(code).hasSize(12);

        mvc.perform(get("/r/{code}", code))
                .andExpect(status().isFound())
                .andExpect(header().string(
                        "Location",
                        "https://example.org/page"
                ));

        mvc.perform(get("/api/urls/{id}", id).with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clickCount").value(1))
                .andExpect(jsonPath("$.lastAccessedAt").isString());

        mvc.perform(get("/r/old"))
                .andExpect(status().isGone());

        mvc.perform(get("/r/beta"))
                .andExpect(status().isGone());

        mvc.perform(post("/api/urls")
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "originalUrl": "https://example.org",
                                  "customAlias": "alpha"
                                }
                                """))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/urls")
                        .with(as(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "originalUrl": "javascript:alert(1)"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    private RequestPostProcessor as(User account) {
        return user(new AccountPrincipal(account));
    }

    private User account(
            String email,
            Role role,
            String passwordHash
    ) {
        var account = new User();
        account.setEmail(email);
        account.setRole(role);
        account.setPasswordHash(passwordHash);

        return users.saveAndFlush(account);
    }

    private ShortUrl url(
            User owner,
            String code,
            boolean enabled,
            Instant expiration,
            long clicks
    ) {
        var url = new ShortUrl();
        url.setUser(owner);
        url.setShortCode(code);
        url.setOriginalUrl("https://example.com/" + code);
        url.setActive(enabled);
        url.setExpiresAt(expiration);
        url.setClickCount(clicks);
        url.setLastAccessedAt(Instant.now().minusSeconds(60));

        return urls.saveAndFlush(url);
    }
}