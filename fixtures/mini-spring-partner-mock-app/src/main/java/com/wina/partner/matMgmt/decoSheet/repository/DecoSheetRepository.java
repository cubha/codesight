package com.wina.partner.matMgmt.decoSheet.repository;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface DecoSheetRepository {
    List<Map<String, Object>> retrieveDecoShetAbcsRqusList();
    int insertTbHods401();
    int insertTbHods401B();
}
