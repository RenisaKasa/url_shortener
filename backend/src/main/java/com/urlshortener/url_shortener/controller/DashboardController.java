package com.urlshortener.url_shortener.controller;

import com.urlshortener.url_shortener.dto.DashboardStatisticsResponse;
import com.urlshortener.url_shortener.service.DashboardService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService service;

    public DashboardController(DashboardService service) {
        this.service = service;
    }

    @GetMapping("/statistics")
    public DashboardStatisticsResponse statistics() {
        return service.getStatistics();
    }
}