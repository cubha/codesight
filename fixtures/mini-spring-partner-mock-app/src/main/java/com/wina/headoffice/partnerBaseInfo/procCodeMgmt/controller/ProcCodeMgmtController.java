package com.wina.headoffice.partnerBaseInfo.procCodeMgmt.controller;

import com.wina.headoffice.partnerBaseInfo.procCodeMgmt.service.ProcCodeMgmtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/headOffice/partner/partnerBaseInfo/procCodeMgmt")
public class ProcCodeMgmtController {
    @Autowired
    private ProcCodeMgmtService procCodeMgmtService;

    @GetMapping("/list")
    public Object list() { return procCodeMgmtService.retrieveProcCodeList(); }

    @PostMapping("/save")
    public Object save() { return procCodeMgmtService.saveProcCode(); }
}
