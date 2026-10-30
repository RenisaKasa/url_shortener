package com.urlshortener.url_shortener.dto;

import com.urlshortener.url_shortener.entity.*;

public record UserResponse(Long id, String email, Role role, boolean active) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getRole(), user.isActive());
    }
}
