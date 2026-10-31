package com.urlshortener.url_shortener.controller;

import com.urlshortener.url_shortener.dto.*;
import com.urlshortener.url_shortener.entity.Role;
import com.urlshortener.url_shortener.query.PageRequests;
import com.urlshortener.url_shortener.service.AdminService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService admin;

    public AdminController(AdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/test")
    public Map<String, String> test() {
        return Map.of("message", "Admin access confirmed");
    }

    @GetMapping("/users")
    public Page<UserResponse> users(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) Role role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id,asc") String sort
    ) {
        return admin.users(search, active, role, PageRequests.users(page, size, sort));
    }

    @GetMapping("/urls")
    public Page<ShortUrlResponse> urls(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UrlStatus status,
            @RequestParam(required = false) Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort
    ) {
        return admin.urls(search, status, userId, PageRequests.urls(page, size, sort));
    }

    @PatchMapping("/users/{id}/status")
    public UserResponse status(
            @PathVariable Long id,
            @Valid @RequestBody AccountStatusRequest request
    ) {
        return admin.setActive(id, request.active());
    }
}
