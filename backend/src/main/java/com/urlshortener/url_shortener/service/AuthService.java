package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.dto.RegisterRequest;
import com.urlshortener.url_shortener.dto.UserResponse;
import com.urlshortener.url_shortener.entity.Role;
import com.urlshortener.url_shortener.entity.User;
import com.urlshortener.url_shortener.repository.UserRepository;
import com.urlshortener.url_shortener.security.AccountPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Service
public class AuthService {
    private final UserRepository users;
    private final PasswordEncoder passwords;

    public AuthService(UserRepository users, PasswordEncoder passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @Transactional
    public void register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        // BCrypt accepts at most 72 bytes, which can be fewer than 72 Unicode characters.
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must not exceed 72 UTF-8 bytes");
        }
        if (users.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already exists");
        }

        var user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwords.encode(request.password()));
        user.setRole(Role.USER);
        user.setActive(true);
        users.save(user);
    }

    @Transactional(readOnly = true)
    public UserResponse currentUser(AccountPrincipal principal) {
        return users.findById(principal.getId()).map(UserResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required"));
    }
}
