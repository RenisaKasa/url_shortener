package com.urlshortener.url_shortener;

import com.fasterxml.jackson.databind.*;
import com.urlshortener.url_shortener.entity.*;
import com.urlshortener.url_shortener.repository.*;
import com.urlshortener.url_shortener.security.AccountPrincipal;
import com.urlshortener.url_shortener.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired ShortUrlRepository urls;
    @Autowired PasswordEncoder passwords;
    @Autowired UrlAccessService access;
    @Autowired AuthService auth;
    private static final String PASSWORD = "correct-password";

    @BeforeEach
    void reset() { urls.deleteAll(); users.deleteAll(); }

    @AfterEach
    void clearContext() { SecurityContextHolder.clearContext(); }

    @Test
    void anonymousRequestsAndPublicResources() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication required"));
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isString());
        // The route is public; its redirect controller will be implemented with URL management.
        mvc.perform(get("/r/example")).andExpect(status().isNotFound());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/auth/csrf'].get.parameters").doesNotExist());
        mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
    }

    @Test
    void logoutIsDocumentedInSwagger() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/auth/logout'].post.operationId").value("logout"))
                .andExpect(jsonPath("$.paths['/api/auth/logout'].post.responses['204']").exists());
    }

    @Test
    void swaggerInitializerIncludesTheSessionCsrfInterceptor() throws Exception {
        var result = mvc.perform(get("/swagger-ui/swagger-initializer.js"))
                .andExpect(status().isOk()).andReturn();
        String script = result.getResponse().getContentAsString();
        assertThat(script).contains("requestInterceptor: async function swaggerCsrfInterceptor(request)");
        assertThat(script).contains("auth/csrf");
        // Also make the real, transformed initializer available to the JavaScript integration check.
        java.nio.file.Files.writeString(java.nio.file.Path.of("target/swagger-initializer.js"), script);
    }

    @Test
    void registrationHashesPasswordsNormalizesEmailAndNeverAcceptsAdminRole() throws Exception {
        var browser = csrf(null);
        mvc.perform(post("/api/auth/register").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"Person@Example.com\",\"password\":\"correct-password\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isCreated());
        var user = users.findByEmail("person@example.com").orElseThrow();
        assertThat(user.getRole()).isEqualTo(Role.USER);
        assertThat(user.isActive()).isTrue();
        assertThat(passwords.matches(PASSWORD, user.getPasswordHash())).isTrue();
        mvc.perform(post("/api/auth/register").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                        .contentType(MediaType.APPLICATION_JSON).content(credentials("person@example.com", PASSWORD)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void registrationRejectsPasswordsBeyondBcryptByteLimit() throws Exception {
        var browser = csrf(null);
        for (String password : new String[]{"a".repeat(73), "\u00e9".repeat(37)}) {
            mvc.perform(post("/api/auth/register").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                            .contentType(MediaType.APPLICATION_JSON).content(credentials("user@example.com", password)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Password must not exceed 72 UTF-8 bytes"));
        }
        assertThat(users.count()).isZero();
    }

    @Test
    void validationAndMalformedBodiesHaveUsefulJsonErrors() throws Exception {
        var browser = csrf(null);
        mvc.perform(post("/api/auth/register").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                        .contentType(MediaType.APPLICATION_JSON).content(credentials("invalid", "short")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.email").exists())
                .andExpect(jsonPath("$.fieldErrors.password").exists());
        mvc.perform(post("/api/auth/login").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                        .contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Invalid request body"));
    }

    @Test
    void loginRotatesSessionAndCsrfAndPersistsIdentityWithoutPassword() throws Exception {
        var user = account("user@example.com", Role.USER);
        var before = csrf(null);
        String previousId = before.session.getId();
        mvc.perform(post("/api/auth/login").session(before.session).header("X-CSRF-TOKEN", before.token)
                        .contentType(MediaType.APPLICATION_JSON).content(credentials("USER@example.com", PASSWORD)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(user.getId()))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        assertThat(before.session.getId()).isNotEqualTo(previousId);
        mvc.perform(get("/api/auth/me").session(before.session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(user.getEmail()));
        mvc.perform(post("/api/auth/logout").session(before.session).header("X-CSRF-TOKEN", before.token))
                .andExpect(status().isForbidden());
        var context = (org.springframework.security.core.context.SecurityContext) before.session
                .getAttribute("SPRING_SECURITY_CONTEXT");
        assertThat(((AccountPrincipal) context.getAuthentication().getPrincipal()).getPassword()).isNull();
    }

    @Test
    void failedLoginsUseTheSameMessageForUnknownWrongPasswordAndInactiveAccounts() throws Exception {
        var user = account("user@example.com", Role.USER);
        failedLogin("unknown@example.com", PASSWORD);
        failedLogin(user.getEmail(), "incorrect-password");
        user.setActive(false);
        users.save(user);
        failedLogin(user.getEmail(), PASSWORD);
    }

    @Test
    void csrfProtectsRegistrationLoginAndLogout() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", PASSWORD)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", PASSWORD))).andExpect(status().isForbidden());
        account("user@example.com", Role.USER);
        var browser = login("user@example.com");
        mvc.perform(post("/api/auth/logout").session(browser.session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").session(browser.session).header("X-CSRF-TOKEN", browser.token))
                .andExpect(status().isNoContent());
        assertThat(browser.session.isInvalid()).isTrue();
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void regularUsersCannotAccessAdminEndpoints() throws Exception {
        var user = account("user@example.com", Role.USER);
        var browser = login(user.getEmail());
        mvc.perform(get("/api/admin/users").session(browser.session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/urls").session(browser.session)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/users/{id}/status", user.getId()).session(browser.session)
                        .header("X-CSRF-TOKEN", browser.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":false}")).andExpect(status().isForbidden());
    }

    @Test
    void adminTestEndpointAllowsOnlyAdministrators() throws Exception {
        mvc.perform(get("/api/admin/test")).andExpect(status().isUnauthorized());

        var user = account("user@example.com", Role.USER);
        var regularBrowser = login(user.getEmail());
        mvc.perform(get("/api/admin/test").session(regularBrowser.session))
                .andExpect(status().isForbidden());

        var admin = account("admin@example.com", Role.ADMIN);
        var adminBrowser = login(admin.getEmail());
        mvc.perform(get("/api/admin/test").session(adminBrowser.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Admin access confirmed"));
    }

    @Test
    void adminListsArePaginatedAndDoNotExposePasswordHashes() throws Exception {
        var admin = account("admin@example.com", Role.ADMIN);
        var user = account("user@example.com", Role.USER);
        var url = url(user);
        var browser = login(admin.getEmail());
        mvc.perform(get("/api/admin/users?size=1&sort=email,asc").session(browser.session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].passwordHash").doesNotExist());
        mvc.perform(get("/api/admin/urls").session(browser.session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(url.getId()))
                .andExpect(jsonPath("$.content[0].userId").value(user.getId()))
                .andExpect(jsonPath("$.content[0].user").doesNotExist());
    }

    @Test
    void deactivationRevokesEveryOldLoginEvenAfterReactivation() throws Exception {
        var admin = account("admin@example.com", Role.ADMIN);
        var user = account("user@example.com", Role.USER);
        var first = login(user.getEmail());
        var second = login(user.getEmail());
        var untouched = login(user.getEmail());
        var administrator = login(admin.getEmail());
        setStatus(administrator, user.getId(), false).andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        mvc.perform(get("/api/auth/me").session(first.session)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").session(second.session)).andExpect(status().isUnauthorized());
        failedLogin(user.getEmail(), PASSWORD);
        setStatus(administrator, user.getId(), true).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").session(untouched.session)).andExpect(status().isUnauthorized());
        var fresh = login(user.getEmail());
        mvc.perform(get("/api/auth/me").session(fresh.session)).andExpect(status().isOk());
        long version = users.findById(user.getId()).orElseThrow().getSessionVersion();
        setStatus(administrator, user.getId(), true).andExpect(status().isOk());
        assertThat(users.findById(user.getId()).orElseThrow().getSessionVersion()).isEqualTo(version);
    }

    @Test
    void adminStatusRejectsUnknownUsersAndInvalidBodies() throws Exception {
        var admin = account("admin@example.com", Role.ADMIN);
        var browser = login(admin.getEmail());
        setStatus(browser, 999999L, false).andExpect(status().isNotFound());
        mvc.perform(patch("/api/admin/users/{id}/status", admin.getId()).session(browser.session)
                        .header("X-CSRF-TOKEN", browser.token).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deletingAnAccountAlsoRevokesItsLogin() throws Exception {
        var user = account("user@example.com", Role.USER);
        var browser = login(user.getEmail());
        users.deleteById(user.getId());
        mvc.perform(get("/api/auth/me").session(browser.session)).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> auth.currentUser(new AccountPrincipal(user)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void ownershipIsEnforcedUsingTheAuthenticatedIdentity() {
        var owner = account("owner@example.com", Role.USER);
        var stranger = account("stranger@example.com", Role.USER);
        var url = url(owner);
        var principal = new AccountPrincipal(owner);
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
        assertThat(access.requireOwnedUrl(url.getId()).getId()).isEqualTo(url.getId());
        var other = new AccountPrincipal(stranger);
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(other, null, other.getAuthorities()));
        assertThatThrownBy(() -> access.requireOwnedUrl(url.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(404));
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> access.requireOwnedUrl(url.getId()))
                .isInstanceOf(org.springframework.security.core.AuthenticationException.class);
    }

    @Test
    void corsAllowsOnlyConfiguredFrontend() throws Exception {
        mvc.perform(options("/api/auth/login").header("Origin", "http://localhost:4200")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-csrf-token"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"));
        mvc.perform(options("/api/auth/login").header("Origin", "https://untrusted.example")
                        .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden());
    }

    @Test
    void passwordChangeUpdatesOnlyTheCurrentAccountAndRevokesAllItsSessions() throws Exception {
        var user = account("user@example.com", Role.USER);
        var other = account("other@example.com", Role.USER);
        var browser = login(user.getEmail());
        var otherLogin = login(user.getEmail());
        var unrelated = login(other.getEmail());
        String nextPassword = "different-password";

        mvc.perform(put("/api/auth/password").session(browser.session)
                        .header("X-CSRF-TOKEN", browser.token).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("currentPassword", PASSWORD,
                                "newPassword", nextPassword, "userId", other.getId()))))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge("JSESSIONID", 0));
        assertThat(browser.session.isInvalid()).isTrue();
        var saved = users.findById(user.getId()).orElseThrow();
        assertThat(saved.getRole()).isEqualTo(Role.USER);
        assertThat(saved.getSessionVersion()).isEqualTo(user.getSessionVersion() + 1);
        assertThat(saved.getPasswordHash()).isNotEqualTo(nextPassword);
        assertThat(passwords.matches(nextPassword, saved.getPasswordHash())).isTrue();
        assertThat(passwords.matches(PASSWORD, saved.getPasswordHash())).isFalse();
        mvc.perform(get("/api/auth/me").session(otherLogin.session)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").session(unrelated.session)).andExpect(status().isOk());
        failedLogin(user.getEmail(), PASSWORD);
        var fresh = login(user.getEmail(), nextPassword);
        mvc.perform(get("/api/auth/me").session(fresh.session)).andExpect(status().isOk());
    }

    @Test
    void administratorsCanChangeTheirOwnPasswordWithoutLosingTheirRole() throws Exception {
        var admin = account("admin@example.com", Role.ADMIN);
        var browser = login(admin.getEmail());
        mvc.perform(put("/api/auth/password").session(browser.session)
                        .header("X-CSRF-TOKEN", browser.token).contentType(MediaType.APPLICATION_JSON)
                        .content(passwordChange(PASSWORD, "new-admin-password")))
                .andExpect(status().isNoContent());
        var fresh = login(admin.getEmail(), "new-admin-password");
        mvc.perform(get("/api/admin/test").session(fresh.session)).andExpect(status().isOk());
    }

    @Test
    void passwordChangeRejectsIncorrectCurrentPasswordAndInvalidNewPasswords() throws Exception {
        var user = account("user@example.com", Role.USER);
        var browser = login(user.getEmail());
        String beforeHash = users.findById(user.getId()).orElseThrow().getPasswordHash();
        for (String[] attempt : new String[][]{
                {"wrong-password", "different-password"}, {PASSWORD, "short"},
                {PASSWORD, PASSWORD}, {PASSWORD, "\u00e9".repeat(37)},
                {"\u00e9".repeat(37), "different-password"}, {"", "different-password"},
                {PASSWORD, "a".repeat(73)}}) {
            mvc.perform(put("/api/auth/password").session(browser.session)
                            .header("X-CSRF-TOKEN", browser.token).contentType(MediaType.APPLICATION_JSON)
                            .content(passwordChange(attempt[0], attempt[1])))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        }
        var saved = users.findById(user.getId()).orElseThrow();
        assertThat(saved.getPasswordHash()).isEqualTo(beforeHash);
        assertThat(saved.getSessionVersion()).isEqualTo(user.getSessionVersion());
        mvc.perform(get("/api/auth/me").session(browser.session)).andExpect(status().isOk());
    }

    @Test
    void passwordChangeRequiresAuthenticationAndCsrfAndIsDocumented() throws Exception {
        var anonymous = csrf(null);
        mvc.perform(put("/api/auth/password").session(anonymous.session)
                        .header("X-CSRF-TOKEN", anonymous.token).contentType(MediaType.APPLICATION_JSON)
                        .content(passwordChange(PASSWORD, "different-password")))
                .andExpect(status().isUnauthorized());
        var user = account("user@example.com", Role.USER);
        var browser = login(user.getEmail());
        mvc.perform(put("/api/auth/password").session(browser.session).contentType(MediaType.APPLICATION_JSON)
                        .content(passwordChange(PASSWORD, "different-password")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/auth/password'].put.responses['204']").exists());
    }

    private String passwordChange(String current, String next) throws Exception {
        return json.writeValueAsString(Map.of("currentPassword", current, "newPassword", next));
    }

    private User account(String email, Role role) {
        var user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwords.encode(PASSWORD));
        user.setRole(role);
        return users.save(user);
    }

    private ShortUrl url(User owner) {
        var url = new ShortUrl();
        url.setOriginalUrl("https://example.com/document");
        url.setShortCode("example");
        url.setUser(owner);
        url.setExpiresAt(Instant.now().plusSeconds(3600));
        url.setLastAccessedAt(Instant.now());
        return urls.save(url);
    }

    private String credentials(String email, String password) throws Exception {
        return json.writeValueAsString(Map.of("email", email, "password", password));
    }

    private Browser csrf(MockHttpSession session) throws Exception {
        var request = get("/api/auth/csrf");
        if (session != null) request.session(session);
        var result = mvc.perform(request).andExpect(status().isOk()).andReturn();
        return new Browser((MockHttpSession) result.getRequest().getSession(false),
                json.readTree(result.getResponse().getContentAsString()).get("token").asText());
    }

    private Browser login(String email) throws Exception {
        return login(email, PASSWORD);
    }

    private Browser login(String email, String password) throws Exception {
        var browser = csrf(null);
        mvc.perform(post("/api/auth/login").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                        .contentType(MediaType.APPLICATION_JSON).content(credentials(email, password)))
                .andExpect(status().isOk());
        return csrf(browser.session);
    }

    private void failedLogin(String email, String password) throws Exception {
        var browser = csrf(null);
        mvc.perform(post("/api/auth/login").session(browser.session).header("X-CSRF-TOKEN", browser.token)
                        .contentType(MediaType.APPLICATION_JSON).content(credentials(email, password)))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    private ResultActions setStatus(Browser browser, Long userId, boolean active) throws Exception {
        return mvc.perform(patch("/api/admin/users/{id}/status", userId).session(browser.session)
                .header("X-CSRF-TOKEN", browser.token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("active", active))));
    }

    private record Browser(MockHttpSession session, String token) {}
}

