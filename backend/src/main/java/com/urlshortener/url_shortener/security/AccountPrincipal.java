package com.urlshortener.url_shortener.security;

import com.urlshortener.url_shortener.entity.User;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.List;

/** The account identity saved in the server-side session. */
public class AccountPrincipal extends org.springframework.security.core.userdetails.User {
    private static final long serialVersionUID = 1L;
    private final Long id;
    private final long sessionVersion;

    public AccountPrincipal(User user) {
        super(user.getEmail(), user.getPasswordHash(), user.isActive(), true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
        this.id = user.getId();
        this.sessionVersion = user.getSessionVersion();
    }

    public Long getId() { return id; }
    public long getSessionVersion() { return sessionVersion; }
}
