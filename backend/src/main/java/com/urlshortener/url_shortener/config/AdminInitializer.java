package com.urlshortener.url_shortener.config;

import com.urlshortener.url_shortener.dto.RegisterRequest;
import com.urlshortener.url_shortener.entity.Role;
import com.urlshortener.url_shortener.entity.User;
import com.urlshortener.url_shortener.repository.UserRepository;

import jakarta.validation.Validator;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Component
@Profile("bootstrap-admin")
public class AdminInitializer implements ApplicationRunner {

    private static final Logger log =
            LoggerFactory.getLogger(AdminInitializer.class);

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final Validator validator;
    private final String email;
    private final String password;

    public AdminInitializer(
            UserRepository users,
            PasswordEncoder passwords,
            Validator validator,
            @Value("${app.bootstrap.admin.email}") String email,
            @Value("${app.bootstrap.admin.password}") String password
    ) {
        this.users = users;
        this.passwords = passwords;
        this.validator = validator;
        this.email = email.trim().toLowerCase(Locale.ROOT);
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var errors = validator.validate(
                new RegisterRequest(email, password)
        );

        if (!errors.isEmpty()
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException(
                    "Provide a valid ADMIN_EMAIL and ADMIN_PASSWORD. "
                            + "Password must contain at least 8 characters "
                            + "and at most 72 UTF-8 bytes."
            );
        }

        var existing = users.findByEmail(email);

        if (existing.isPresent()) {
            if (existing.get().getRole() != Role.ADMIN) {
                throw new IllegalStateException(
                        "This email belongs to a regular user. "
                                + "Choose another ADMIN_EMAIL."
                );
            }

            log.info("Administrator already exists; no changes made.");
            return;
        }

        var admin = new User();
        admin.setEmail(email);
        admin.setPasswordHash(passwords.encode(password));
        admin.setRole(Role.ADMIN);
        admin.setActive(true);

        users.saveAndFlush(admin);

        log.info("Administrator account created successfully.");
    }
}