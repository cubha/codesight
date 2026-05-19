package com.wina.partner.matMgmt.decoSheet.controller;

import com.wina.partner.matMgmt.decoSheet.service.DecoSheetService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/partner/matMgmt/DecoSheet")
public class DecoSheetController {
    @Autowired
    private DecoSheetService decoSheetService;

    @GetMapping("/list")
    public Object list() {
        return decoSheetService.retrieveDecoShetAbcsRqusList();
    }

    @PostMapping("/excel")
    public Object excel() {
        return decoSheetService.retrieveDecoShetAbcsRqusList();
    }

    @PostMapping("/a/create")
    public Object createA() {
        return decoSheetService.insertTbHods401();
    }

    @PostMapping("/b/create")
    public Object createB() {
        return decoSheetService.insertTbHods401B();
    }
}
