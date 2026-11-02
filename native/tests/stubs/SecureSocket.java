package cn.qihang.oral;
import java.util.*;
import org.json.*;
public final class SecureSocket {
 public interface Listener{void text(String text)throws Exception;void binary(byte[] data)throws Exception;void closed();}
 public final List<JSONObject> sent=new ArrayList<>();
 public SecureSocket(String url,Map<String,String> headers,Listener listener){}
 public void send(String text){sent.add(new JSONObject(text));}
 public void ping(){}
 public void start(){}
 public void close(){}
}
