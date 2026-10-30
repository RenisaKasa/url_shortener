package com.urlshortener.url_shortener.security;

import com.urlshortener.url_shortener.repository.UserRepository;
import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Service;
import java.util.Locale;

@Service
public class AccountDetailsService implements UserDetailsService {
    private final UserRepository users;

    public AccountDetailsService(UserRepository users) { this.users = users; }

    @Override
    public UserDetails loadUserByUsername(String email) {
        return users.findByEmail(email.trim().toLowerCase(Locale.ROOT))
                .map(AccountPrincipal::new)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid email or password"));
    }
}
