package com.wina.partner.order.controller;

import com.wina.partner.order.service.OrderService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/order")
public class OrderController {
    private final OrderService service;
    public OrderController(OrderService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
