package com.example.controller;

import com.example.service.OrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private OrderService orderService;

    @Autowired
    public void setOrderService(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping
    public String list() {
        return orderService.findAll();
    }

    @GetMapping("/{id}")
    public String get(@PathVariable Long id) {
        return orderService.findById(id);
    }

    @PostMapping
    public String place(@RequestBody String body) {
        return orderService.place(body);
    }

    @PostMapping("/{id}/cancel")
    public String cancel(@PathVariable Long id) {
        return orderService.cancel(id);
    }
}
