package com.urlshortener.url_shortener.controller;

import com.urlshortener.url_shortener.dto.*;
import com.urlshortener.url_shortener.service.AdminService;
import jakarta.validation.Valid;
import org.springframework.data.domain.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService admin;
    public AdminController(AdminService admin) { this.admin = admin; }

    @GetMapping("/test")
    public Map<String, String> test() {
        return Map.of("message", "Admin access confirmed");
    }

    @GetMapping("/users")
    public Page<UserResponse> users(Pageable pageable) { return admin.users(pageable); }

    @GetMapping("/urls")
    public Page<ShortUrlResponse> urls(Pageable pageable) { return admin.urls(pageable); }

    @PatchMapping("/users/{id}/status")
    public UserResponse status(@PathVariable Long id, @Valid @RequestBody AccountStatusRequest request) {
        return admin.setActive(id, request.active());
    }
}
