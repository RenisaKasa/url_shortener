package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.dto.*;
import com.urlshortener.url_shortener.repository.*;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@PreAuthorize("hasRole('ADMIN')")
@Transactional(readOnly = true)
public class AdminService {
    private final UserRepository users;
    private final ShortUrlRepository urls;

    public AdminService(UserRepository users, ShortUrlRepository urls) {
        this.users = users;
        this.urls = urls;
    }

    public Page<UserResponse> users(Pageable pageable) { return users.findAll(pageable).map(UserResponse::from); }
    public Page<ShortUrlResponse> urls(Pageable pageable) { return urls.findAll(pageable).map(ShortUrlResponse::from); }

    @Transactional
    public UserResponse setActive(Long id, boolean active) {
        var user = users.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        if (user.isActive() != active) {
            user.setActive(active);
            user.setSessionVersion(user.getSessionVersion() + 1);
        }
        return UserResponse.from(user);
    }
}
