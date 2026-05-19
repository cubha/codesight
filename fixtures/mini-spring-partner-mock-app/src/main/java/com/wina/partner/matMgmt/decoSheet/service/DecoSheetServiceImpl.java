package com.wina.partner.matMgmt.decoSheet.service;

import com.wina.partner.matMgmt.decoSheet.repository.DecoSheetRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DecoSheetServiceImpl implements DecoSheetService {
    @Autowired
    private DecoSheetRepository decoSheetRepository;

    @Override
    public Object retrieveDecoShetAbcsRqusList() {
        return decoSheetRepository.retrieveDecoShetAbcsRqusList();
    }

    @Override
    public Object insertTbHods401() {
        return decoSheetRepository.insertTbHods401();
    }

    @Override
    public Object insertTbHods401B() {
        return decoSheetRepository.insertTbHods401B();
    }
}
