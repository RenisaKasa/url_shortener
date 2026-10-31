package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.dto.*;
import com.urlshortener.url_shortener.entity.Role;
import com.urlshortener.url_shortener.query.SearchSpecifications;
import com.urlshortener.url_shortener.repository.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    public AdminService(
            UserRepository users,
            ShortUrlRepository urls
    ) {
        this.users = users;
        this.urls = urls;
    }


    //    public Page<UserResponse> users(Pageable pageable) { return users.findAll(pageable).map(UserResponse::from); }
//    public Page<ShortUrlResponse> urls(Pageable pageable) { return urls.findAll(pageable).map(ShortUrlResponse::from); }



    public Page<UserResponse> users(
            String search,
            Boolean active,
            Role role,
            Pageable pageable
    ) {
        return users.findAll(
                SearchSpecifications.users(search, active, role),
                pageable
        ).map(UserResponse::from);
    }

    public Page<ShortUrlResponse> urls(
            String search,
            UrlStatus status,
            Long userId,
            Pageable pageable
    ) {
        return urls.findAll(
                SearchSpecifications.urls(userId, search, status),
                pageable
        ).map(ShortUrlResponse::from);
    }

    @Transactional
    public UserResponse setActive(Long id, boolean active) {
        var user = users.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User not found"
                ));

        if (user.isActive() != active) {
            user.setActive(active);
            user.setSessionVersion(
                    user.getSessionVersion() + 1
            );
        }

        return UserResponse.from(user);
    }
}
