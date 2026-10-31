package com.urlshortener.url_shortener.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.urlshortener.url_shortener.exception.ApiError;
import com.urlshortener.url_shortener.repository.UserRepository;
import com.urlshortener.url_shortener.security.AccountStatusFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.*;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.*;
import org.springframework.security.web.csrf.*;
import org.springframework.security.web.authentication.session.*;
import org.springframework.web.cors.*;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    // Logout is handled by Spring Security's filter, so MVC cannot document it automatically.
    @Bean
    public OpenApiCustomizer logoutDocumentation() {
        return api -> api.path("/api/auth/logout", new PathItem().post(new Operation()
                .operationId("logout")
                .addTagsItem("auth-controller")
                .summary("Log out of the current session")
                .description("Invalidates the session and clears its cookie. Requires a CSRF token, supplied automatically by Swagger.")
                .responses(new ApiResponses()
                        .addApiResponse("204", new ApiResponse().description("Logged out"))
                        .addApiResponse("403", new ApiResponse().description("Missing or invalid CSRF token")))));
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public CsrfTokenRepository csrfTokenRepository() {
        return new HttpSessionCsrfTokenRepository();
    }

    @Bean
    public SessionAuthenticationStrategy sessionAuthenticationStrategy(CsrfTokenRepository csrfTokens) {
        return new CompositeSessionAuthenticationStrategy(List.of(
                new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrfTokens)));
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.security.allowed-origin:http://localhost:4200}") String allowedOrigin) {
        var configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(allowedOrigin));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN"));
        configuration.setAllowCredentials(true);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, UserRepository users,
            SecurityContextRepository contexts, CsrfTokenRepository csrfTokens, ObjectMapper json,
            CorsConfigurationSource corsConfigurationSource) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.csrfTokenRepository(csrfTokens))
                .securityContext(context -> context.securityContextRepository(contexts))
                .addFilterBefore(new AccountStatusFilter(users), CsrfFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf", "/r/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> {
                            response.setStatus(401);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            json.writeValue(response.getOutputStream(), new ApiError(401, "Authentication required"));
                        })
                        .accessDeniedHandler((request, response, exception) -> {
                            response.setStatus(403);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            json.writeValue(response.getOutputStream(), new ApiError(403, "Access denied or invalid CSRF token"));
                        }))
                .logout(logout -> logout.logoutUrl("/api/auth/logout")
                        .invalidateHttpSession(true).clearAuthentication(true).deleteCookies("JSESSIONID")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .requestCache(cache -> cache.disable());
        return http.build();
    }
}
