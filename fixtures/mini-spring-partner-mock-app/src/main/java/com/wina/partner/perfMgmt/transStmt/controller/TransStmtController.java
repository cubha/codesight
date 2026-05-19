package com.wina.partner.perfMgmt.transStmt.controller;

import com.wina.partner.perfMgmt.transStmt.service.TransStmtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/partner/perfMgmt/transStmt")
public class TransStmtController {
    @Autowired
    private TransStmtService transStmtService;

    @GetMapping("/list")
    public Object list() {
        return transStmtService.retrieveTransStmtList();
    }

    @GetMapping("/detail")
    public Object detail() {
        return transStmtService.retrieveTransStmtDetailList();
    }

    @PostMapping("/excel")
    public Object excel() {
        return transStmtService.retrieveTransStmtExcelList();
    }
}
