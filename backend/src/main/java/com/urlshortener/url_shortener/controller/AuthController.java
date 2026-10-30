package com.urlshortener.url_shortener.controller;

import com.urlshortener.url_shortener.dto.*;
import com.urlshortener.url_shortener.security.AccountPrincipal;
import com.urlshortener.url_shortener.service.AuthService;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Parameter;
import org.springframework.http.*;
import org.springframework.security.authentication.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contexts;
    private final SessionAuthenticationStrategy sessions;

    public AuthController(AuthService authService, AuthenticationManager authenticationManager,
                          SecurityContextRepository contexts, SessionAuthenticationStrategy sessions) {
        this.authService = authService;
        this.authenticationManager = authenticationManager;
        this.contexts = contexts;
        this.sessions = sessions;
    }

    @GetMapping("/csrf")
    public CsrfToken csrf(@Parameter(hidden = true) CsrfToken token) { return token; }

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(@Valid @RequestBody RegisterRequest request) {
        authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("message", "User registered successfully"));
    }

    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest credentials,
                              HttpServletRequest request, HttpServletResponse response) {
        var authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(credentials.email(), credentials.password()));
        sessions.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return authService.currentUser((AccountPrincipal) authentication.getPrincipal());
    }

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AccountPrincipal principal) {
        return authService.currentUser(principal);
    }
}
