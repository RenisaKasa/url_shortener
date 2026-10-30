package com.urlshortener.url_shortener.security;

import com.urlshortener.url_shortener.repository.UserRepository;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** Rechecks account status on every request, including sessions created before deactivation. */
public class AccountStatusFilter extends OncePerRequestFilter {
    private final UserRepository users;

    public AccountStatusFilter(UserRepository users) { this.users = users; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                  FilterChain chain) throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AccountPrincipal principal) {
            boolean valid = users.findById(principal.getId())
                    .filter(user -> user.isActive() && user.getSessionVersion() == principal.getSessionVersion())
                    .isPresent();
            if (!valid) {
                var session = request.getSession(false);
                if (session != null) session.invalidate();
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }
}
